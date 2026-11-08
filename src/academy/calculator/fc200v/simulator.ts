import type { CalcSequence, SimulationReport, SimulatedStep } from "../types";
import { FC200V } from "./model";
import { evaluate } from "../../math/expression";

/**
 * Deterministic FC-200V simulator.
 *
 * It models only the screens the academy's sequences use (CMPD, CNVR, CASH,
 * COMP), following the facts in model.ts. Memory starts UNKNOWN: a sequence
 * that relies on values left over from a previous calculation fails, so every
 * published sequence must enter every value it needs.
 *
 * The financial formulas below follow Casio's documented CMPD conventions
 * (cash-flow sign convention, I% annual, P/Y and C/Y). They are deliberately
 * separate from src/academy/math, which is the independent cross-check.
 */

const CMPD_ROWS = ["Set", "n", "I%", "PV", "PMT", "FV", "P/Y", "C/Y"] as const;
const CNVR_ROWS = ["n", "I%", "EFF", "APR"] as const;
const CASH_ROWS = ["I%", "Csh", "NPV", "IRR", "PBP", "NFV"] as const;

type Mode = "NONE" | "CMPD" | "CNVR" | "CASH" | "COMP";

export class SimulationError extends Error {}

export function formatDisplay(value: number, digits = FC200V.displayDigits): string {
  if (!Number.isFinite(value)) throw new SimulationError("Math ERROR");
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e10 || abs < 1e-9) {
    const [mantissa, exponent] = value.toExponential(digits - 1).split("e");
    return `${trimZeros(mantissa)}E${Number(exponent)}`;
  }
  const intDigits = Math.max(1, Math.floor(Math.log10(abs)) + 1);
  const decimals = Math.max(0, digits - intDigits);
  return trimZeros(value.toFixed(decimals));
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/** Parses a display string ("FV=16288.94627", "EFF=12.6825", "120") into a number. */
export function parseDisplayValue(display: string): number | null {
  const raw = display.includes("=") ? display.split("=").pop()! : display;
  const cleaned = raw.replace("E", "e").trim();
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

class Fc200vState {
  mode: Mode = "NONE";
  cursor = 0;
  buffer = "";
  display = "";
  setMenuOpen = false;
  shift = false;
  values = new Map<string, number>();
  timing: "End" | "Begin" | null = null; // unknown until set
  editorOpen = false;
  /** null = unknown (stale) contents; becomes a list only after an explicit clear. */
  cashFlows: number[] | null = null;
  expression = "";
  compTokens: string[] = [];

  rows(): readonly string[] {
    if (this.mode === "CMPD") return CMPD_ROWS;
    if (this.mode === "CNVR") return CNVR_ROWS;
    if (this.mode === "CASH") return CASH_ROWS;
    return [];
  }

  currentRow(): string {
    return this.rows()[this.cursor] ?? "";
  }

  rowDisplay(): string {
    const row = this.currentRow();
    if (row === "Set") return this.timing ? `Set:${this.timing}` : "Set:?";
    if (row === "Csh") return "Csh=D.Editor x";
    if (["EFF", "APR", "NPV", "IRR", "PBP", "NFV"].includes(row) && !this.values.has(row)) return `${row}:Solve`;
    const value = this.values.get(row);
    return value === undefined ? `${row}=?` : `${row}=${formatDisplay(value)}`;
  }

  need(name: string): number {
    const value = this.values.get(name);
    if (value === undefined) {
      throw new SimulationError(`הערך ${name} לא הוזן ברצף; הרצף מסתמך על זיכרון קודם של המחשבון`);
    }
    return value;
  }

  press(key: string): void {
    if (key === "SHIFT") {
      this.shift = true;
      return;
    }
    const shifted = this.shift;
    this.shift = false;

    if (["CMPD", "CNVR", "CASH", "COMP"].includes(key)) {
      this.mode = key as Mode;
      this.cursor = 0;
      this.buffer = "";
      this.setMenuOpen = false;
      this.editorOpen = false;
      this.values.delete("EFF");
      this.values.delete("APR");
      this.values.delete("NPV");
      this.values.delete("IRR");
      if (key === "COMP") {
        this.compTokens = [];
        this.display = "0";
      } else {
        this.display = this.rowDisplay();
      }
      return;
    }

    if (this.mode === "COMP") return this.pressComp(key, shifted);
    if (this.mode === "NONE") throw new SimulationError("לא נבחר מצב עבודה במחשבון");

    if (this.setMenuOpen) {
      if (key === "1" || key === "2") {
        this.timing = key === "1" ? "Begin" : "End";
        this.setMenuOpen = false;
        this.display = this.rowDisplay();
        return;
      }
      throw new SimulationError("בתפריט Set יש לבחור 1 או 2");
    }

    if (this.editorOpen) return this.pressEditor(key);

    if (/^[0-9]$/.test(key) || key === "DOT" || key === "NEG") {
      this.buffer += key === "DOT" ? "." : key === "NEG" ? "-" : key;
      this.display = `${this.currentRow()}=${this.buffer}`;
      return;
    }

    switch (key) {
      case "UP":
      case "DOWN": {
        if (this.buffer) throw new SimulationError("הוקלד ערך בלי EXE לפני מעבר שורה");
        const delta = key === "UP" ? -1 : 1;
        const next = this.cursor + delta;
        if (next < 0 || next >= this.rows().length) throw new SimulationError("מעבר מעבר לקצה הרשימה");
        this.cursor = next;
        this.display = this.rowDisplay();
        return;
      }
      case "EXE": {
        const row = this.currentRow();
        if (!this.buffer) {
          if (row === "Set") {
            this.setMenuOpen = true;
            this.display = "1:Begin 2:End";
            return;
          }
          if (row === "Csh") {
            this.editorOpen = true;
            this.display = "D.Editor";
            return;
          }
          this.display = this.rowDisplay();
          return;
        }
        const value = Number(this.buffer);
        if (!Number.isFinite(value)) throw new SimulationError(`ערך לא תקין: ${this.buffer}`);
        this.buffer = "";
        this.values.set(row, value);
        this.display = this.rowDisplay();
        return; // cursor stays (fact input.exe_stays)
      }
      case "SOLVE": {
        if (this.buffer) throw new SimulationError("הוקלד ערך בלי EXE לפני SOLVE");
        const row = this.currentRow();
        const value = this.solve(row);
        this.values.set(row, value);
        this.display = `${row}=${formatDisplay(value)}`;
        return;
      }
      case "ESC":
        this.display = this.rowDisplay();
        return;
      default:
        throw new SimulationError(`המקש ${key} אינו פעיל במצב ${this.mode}`);
    }
  }

  private pressEditor(key: string): void {
    if (key === "CLR_DATA") {
      this.cashFlows = [];
      this.display = "D.Editor (ריק)";
      return;
    }
    if (/^[0-9]$/.test(key) || key === "DOT" || key === "NEG") {
      this.buffer += key === "DOT" ? "." : key === "NEG" ? "-" : key;
      this.display = this.buffer;
      return;
    }
    if (key === "EXE") {
      if (this.cashFlows === null) throw new SimulationError("עורך התזרימים לא נוקה לפני ההזנה");
      const value = Number(this.buffer);
      if (!this.buffer || !Number.isFinite(value)) throw new SimulationError("ערך תזרים לא תקין");
      this.cashFlows.push(value);
      this.buffer = "";
      this.display = `${this.cashFlows.length}: ${formatDisplay(value)}`;
      return;
    }
    if (key === "ESC") {
      this.editorOpen = false;
      this.display = this.rowDisplay();
      return;
    }
    throw new SimulationError(`המקש ${key} אינו פעיל בעורך התזרימים`);
  }

  private pressComp(key: string, shifted: boolean): void {
    const map: Record<string, string> = { ADD: "+", SUB: "-", MUL: "*", DIV: "/", LPAREN: "(", RPAREN: ")", DOT: "." };
    if (shifted) {
      if (key === "DIV") this.compTokens.push(" nCr ");
      else if (key === "MUL") this.compTokens.push(" nPr ");
      else if (key === "INV") this.compTokens.push("!");
      else throw new SimulationError(`SHIFT ואחריו ${key} אינו נתמך בסימולטור`);
      this.display = this.compTokens.join("");
      return;
    }
    if (/^[0-9]$/.test(key)) this.compTokens.push(key);
    else if (key === "NEG") this.compTokens.push("-");
    else if (map[key]) this.compTokens.push(map[key]);
    else if (key === "EXE") {
      const value = evaluateComp(this.compTokens.join(""));
      this.display = formatDisplay(value);
      this.values.set("Ans", value);
      return;
    } else throw new SimulationError(`המקש ${key} אינו פעיל במצב COMP`);
    this.display = this.compTokens.join("");
  }

  private solve(row: string): number {
    if (this.mode === "CMPD") return this.solveCmpd(row);
    if (this.mode === "CNVR") {
      const n = this.need("n");
      const rate = this.need("I%") / 100;
      if (row === "EFF") return (Math.pow(1 + rate / n, n) - 1) * 100;
      if (row === "APR") return n * (Math.pow(1 + rate, 1 / n) - 1) * 100;
      throw new SimulationError(`לא ניתן לפתור את ${row} במצב CNVR`);
    }
    if (this.mode === "CASH") {
      if (this.cashFlows === null || this.cashFlows.length === 0) throw new SimulationError("אין תזרימים בעורך");
      if (row === "NPV") {
        const i = this.need("I%") / 100;
        return this.cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + i, t), 0);
      }
      if (row === "IRR") return cashIrr(this.cashFlows) * 100;
      throw new SimulationError(`הסימולטור אינו תומך ב-${row}`);
    }
    throw new SimulationError("SOLVE אינו פעיל במצב זה");
  }

  private solveCmpd(target: string): number {
    if (!this.timing) throw new SimulationError("תזמון התשלום (Set) לא נקבע ברצף");
    const S = this.timing === "Begin" ? 1 : 0;
    const py = this.need("P/Y");
    const cy = this.need("C/Y");
    const get = (name: string) => (name === target ? NaN : this.need(name));
    const n = target === "n" ? NaN : get("n");
    const iPct = target === "I%" ? NaN : get("I%");
    const pv = target === "PV" ? NaN : get("PV");
    const pmt = target === "PMT" ? NaN : get("PMT");
    const fv = target === "FV" ? NaN : get("FV");

    const periodic = (annualPct: number) => Math.pow(1 + annualPct / (100 * cy), cy / py) - 1;
    // Casio CMPD relation: 0 = PV + α·PMT + β·FV, α = (1 + i·S)(1 − (1+i)^−n)/i, β = (1+i)^−n
    const residual = (N: number, I: number, PV: number, PMT: number, FV: number) => {
      const i = periodic(I);
      if (i === 0) return PV + PMT * N + FV;
      const beta = Math.pow(1 + i, -N);
      const alpha = ((1 + i * S) * (1 - beta)) / i;
      return PV + alpha * PMT + beta * FV;
    };

    switch (target) {
      case "FV": {
        const i = periodic(iPct);
        const beta = Math.pow(1 + i, -n);
        const alpha = i === 0 ? n : ((1 + i * S) * (1 - beta)) / i;
        return -(pv + alpha * pmt) / beta;
      }
      case "PV": {
        const i = periodic(iPct);
        const beta = Math.pow(1 + i, -n);
        const alpha = i === 0 ? n : ((1 + i * S) * (1 - beta)) / i;
        return -(alpha * pmt + beta * fv);
      }
      case "PMT": {
        const i = periodic(iPct);
        const beta = Math.pow(1 + i, -n);
        const alpha = i === 0 ? n : ((1 + i * S) * (1 - beta)) / i;
        return -(pv + beta * fv) / alpha;
      }
      case "n":
        return bisect((N) => residual(N, iPct, pv, pmt, fv), 1e-9, 10_000);
      case "I%":
        return bisect((I) => residual(n, I, pv, pmt, fv), -99.9, 10_000);
      default:
        throw new SimulationError(`לא ניתן לפתור את ${target}`);
    }
  }
}

function bisect(f: (x: number) => number, low: number, high: number): number {
  let fLow = f(low);
  if (Math.sign(fLow) === Math.sign(f(high))) throw new SimulationError("Math ERROR (אין פתרון בטווח)");
  for (let k = 0; k < 400; k++) {
    const mid = (low + high) / 2;
    const fMid = f(mid);
    if (fMid === 0) return mid;
    if (Math.sign(fMid) === Math.sign(fLow)) {
      low = mid;
      fLow = fMid;
    } else high = mid;
  }
  return (low + high) / 2;
}

function cashIrr(flows: number[]): number {
  const f = (r: number) => flows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  return bisect(f, -0.5, 10);
}

/**
 * Evaluates the COMP expression produced by the key presses with the safe
 * expression parser (no eval, so it also runs on Cloudflare Workers).
 */
function evaluateComp(expression: string): number {
  let expr = expression.replace(/(\d+)!/g, "factorial($1)");
  expr = expr.replace(/(\d+)\s*nCr\s*(\d+)/g, "nCr($1,$2)").replace(/(\d+)\s*nPr\s*(\d+)/g, "nPr($1,$2)");
  try {
    return evaluate(expr);
  } catch {
    throw new SimulationError("Math ERROR");
  }
}

/** Replays a sequence and compares every expected display. */
export function simulate(sequence: CalcSequence): SimulationReport {
  const state = new Fc200vState();
  const steps: SimulatedStep[] = [];
  const errors: string[] = [];
  const keys = FC200V.keys;
  sequence.steps.forEach((step, index) => {
    if (errors.length) return;
    try {
      for (const keyId of step.keys) {
        const def = keys[keyId];
        if (!def && keyId !== "CLR_DATA") throw new SimulationError(`מקש לא מוכר בדגם: ${keyId}`);
        const presses = def?.press ?? [keyId];
        for (const press of presses) state.press(press);
      }
      const ok = step.expectDisplay === undefined || step.expectDisplay === state.display;
      steps.push({ index, display: state.display, expected: step.expectDisplay, ok });
      if (!ok) errors.push(`שלב ${index + 1}: צפוי "${step.expectDisplay}", התקבל "${state.display}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ index, display: state.display, expected: step.expectDisplay, ok: false, error: message });
      errors.push(`שלב ${index + 1}: ${message}`);
    }
  });
  const finalDisplay = state.display;
  if (!errors.length && finalDisplay !== sequence.result.display) {
    errors.push(`התצוגה הסופית "${finalDisplay}" שונה מהתוצאה המוצהרת "${sequence.result.display}"`);
  }
  return { ok: errors.length === 0, steps, finalDisplay, finalValue: parseDisplayValue(finalDisplay), errors };
}

export interface TraceFrame {
  stepIndex: number;
  key: string; // physical key pressed
  display: string;
  stepEnd: boolean;
  expected?: string;
}

/** Display after every physical key press. Drives the deterministic calculator animation. */
export function trace(sequence: CalcSequence): { frames: TraceFrame[]; ok: boolean; error: string | null } {
  const state = new Fc200vState();
  const frames: TraceFrame[] = [];
  try {
    sequence.steps.forEach((step, stepIndex) => {
      const presses = step.keys.flatMap((k) => FC200V.keys[k]?.press ?? [k]);
      presses.forEach((press, i) => {
        state.press(press);
        frames.push({ stepIndex, key: press, display: state.display, stepEnd: i === presses.length - 1, expected: i === presses.length - 1 ? step.expectDisplay : undefined });
      });
    });
    return { frames, ok: true, error: null };
  } catch (error) {
    return { frames, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
