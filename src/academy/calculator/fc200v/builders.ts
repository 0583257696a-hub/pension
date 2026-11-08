import type { CalcPlan, CalcSequence, CalcStep, CmpdVariable, CompToken } from "../types";

/**
 * Deterministic builders: CalcPlan -> FC-200V key sequence.
 * The author (or AI) supplies the plan and the expected final display; the
 * builder never computes the answer, so the simulator check stays meaningful.
 */

export function numberToKeys(value: number): string[] {
  const text = String(value);
  if (/e/i.test(text)) throw new Error(`לא ניתן להקליד ערך בכתיב מדעי: ${text}`);
  return text.split("").map((ch) => (ch === "-" ? "NEG" : ch === "." ? "DOT" : ch));
}

const CMPD_ORDER = ["n", "I%", "PV", "PMT", "FV", "P/Y", "C/Y"] as const;

const DEFAULT_MEANINGS: Record<(typeof CMPD_ORDER)[number], string> = {
  n: "מספר התקופות (מספר התשלומים)",
  "I%": "הריבית השנתית באחוזים",
  PV: "הערך הנוכחי",
  PMT: "התשלום התקופתי",
  FV: "הערך העתידי",
  "P/Y": "מספר תשלומים בשנה",
  "C/Y": "מספר פעמים שהריבית מצטברת בשנה",
};

function fmt(value: number): string {
  return String(value);
}

export interface BuildOptions {
  expectedDisplay: string;
  resultMeaning: string;
  commonMistakes?: string[];
}

export function buildSequence(plan: CalcPlan, options: BuildOptions): CalcSequence {
  switch (plan.kind) {
    case "cmpd":
      return buildCmpd(plan, options);
    case "cnvr":
      return buildCnvr(plan, options);
    case "cash":
      return buildCash(plan, options);
    case "comp":
      return buildComp(plan.expression, options);
  }
}

function buildCmpd(plan: Extract<CalcPlan, { kind: "cmpd" }>, options: BuildOptions): CalcSequence {
  const valueOf: Record<string, number | undefined> = {
    n: plan.n,
    "I%": plan.i,
    PV: plan.pv,
    PMT: plan.pmt,
    FV: plan.fv,
    "P/Y": plan.py,
    "C/Y": plan.cy,
  };
  const meanings = { ...DEFAULT_MEANINGS, ...(plan.meanings ?? {}) } as Record<string, string>;
  const steps: CalcStep[] = [
    { keys: ["CMPD"], explanation: "כניסה למצב ריבית דריבית (CMPD). המסך נפתח בשורת Set." },
    {
      keys: ["EXE", plan.set === "End" ? "2" : "1"],
      explanation:
        plan.set === "End"
          ? "קובעים תשלום בסוף תקופה: EXE ואז 2 (End). קובעים תמיד במפורש, כי ההגדרה הקודמת נשמרת במחשבון."
          : "קובעים תשלום בתחילת תקופה: EXE ואז 1 (Begin), כי התשלום הראשון מתבצע מיד.",
      expectDisplay: `Set:${plan.set}`,
    },
  ];
  const inputs: CalcSequence["inputs"] = [{ variable: "Set", value: plan.set, meaning: plan.set === "End" ? "תשלום בסוף תקופה" : "תשלום בתחילת תקופה" }];

  for (const row of CMPD_ORDER) {
    if (row === plan.solveFor) {
      steps.push({ keys: ["DOWN"], explanation: `מדלגים על ${row}: זה המשתנה שנחשב בסוף.` });
      continue;
    }
    const value = valueOf[row];
    if (value === undefined) throw new Error(`חסר ערך עבור ${row} בתוכנית החישוב`);
    steps.push({
      keys: ["DOWN", ...numberToKeys(value), "EXE"],
      explanation: `יורדים לשורה ${row} ומקלידים ${fmt(value)}: ${meanings[row]}.${value < 0 ? " הערך שלילי כי זה כסף שיוצא מהכיס, ולכן מקלידים (-) לפני המספר." : ""}`,
      expectDisplay: `${row}=${fmt(value)}`,
    });
    inputs.push({ variable: row, value: fmt(value), meaning: meanings[row] });
  }

  const ups = CMPD_ORDER.length - 1 - CMPD_ORDER.indexOf(plan.solveFor);
  if (ups > 0) {
    steps.push({ keys: Array(ups).fill("UP"), explanation: `חוזרים למעלה לשורה ${plan.solveFor} (${ups} לחיצות על ▲).` });
  }
  steps.push({ keys: ["SOLVE"], explanation: `לוחצים SOLVE כדי לחשב את ${plan.solveFor}.`, expectDisplay: options.expectedDisplay });

  const mistakes = [
    "לא לקבוע במפורש את Set, ולעבוד עם Begin שנשאר מתרגיל קודם.",
    "לא להזין P/Y ו-C/Y, ולחשב עם ערכים שנשארו בזיכרון.",
    "להזין את כל הסכומים באותו סימן. כסף שיוצא מוזן שלילי וכסף שנכנס חיובי.",
    ...(options.commonMistakes ?? []),
  ];

  return {
    model: "casio-fc-200v",
    mode: "CMPD",
    modeExplanation: "מצב CMPD (ריבית דריבית) פותר כל בעיה עם סכום חד-פעמי, תשלומים קבועים או שניהם: n, I%, PV, PMT, FV.",
    reset: {
      required: false,
      note: "אין צורך באיפוס: הרצף מזין במפורש את כל הערכים, כולל Set, P/Y ו-C/Y, ולכן ערכים ישנים בזיכרון לא משפיעים.",
    },
    inputs,
    steps,
    result: { variable: plan.solveFor, display: options.expectedDisplay, meaning: options.resultMeaning },
    commonMistakes: mistakes,
    factKeys: ["cmpd.entry", "cmpd.rows", "cmpd.set_menu", "input.exe_stays", "input.neg", "solve.key", "cmpd.convention", "display.format"],
  };
}

function buildCnvr(plan: Extract<CalcPlan, { kind: "cnvr" }>, options: BuildOptions): CalcSequence {
  const target = plan.solveFor;
  const steps: CalcStep[] = [
    { keys: ["CNVR"], explanation: "כניסה למצב המרת ריבית (CNVR)." },
    {
      keys: [...numberToKeys(plan.n), "EXE"],
      explanation: `בשורה n מקלידים ${plan.n}: מספר הפעמים שהריבית מצטברת בשנה.`,
      expectDisplay: `n=${plan.n}`,
    },
    {
      keys: ["DOWN", ...numberToKeys(plan.i), "EXE"],
      explanation:
        target === "EFF"
          ? `בשורה I% מקלידים ${plan.i}: הריבית הנומינלית השנתית שרוצים להמיר.`
          : `בשורה I% מקלידים ${plan.i}: הריבית האפקטיבית השנתית שרוצים להמיר.`,
      expectDisplay: `I%=${plan.i}`,
    },
    {
      keys: target === "EFF" ? ["DOWN"] : ["DOWN", "DOWN"],
      explanation: `יורדים לשורה ${target}.`,
      expectDisplay: `${target}:Solve`,
    },
    { keys: ["SOLVE"], explanation: `לוחצים SOLVE לקבלת ${target === "EFF" ? "הריבית האפקטיבית" : "הריבית הנומינלית"}.`, expectDisplay: options.expectedDisplay },
  ];
  return {
    model: "casio-fc-200v",
    mode: "CNVR",
    modeExplanation: "מצב CNVR ממיר בין ריבית נומינלית שנתית (APR) לריבית אפקטיבית שנתית (EFF) לפי מספר ההיוונים בשנה.",
    reset: { required: false, note: "אין צורך באיפוס: n ו-I% מוזנים במפורש." },
    inputs: [
      { variable: "n", value: String(plan.n), meaning: "מספר היוונים בשנה" },
      { variable: "I%", value: String(plan.i), meaning: target === "EFF" ? "ריבית נומינלית שנתית" : "ריבית אפקטיבית שנתית" },
    ],
    steps,
    result: { variable: target, display: options.expectedDisplay, meaning: options.resultMeaning },
    commonMistakes: [
      "להקליד ב-n את מספר השנים במקום מספר ההיוונים בשנה.",
      "להקליד את הריבית כשבר עשרוני (0.12) במקום באחוזים (12).",
      ...(options.commonMistakes ?? []),
    ],
    factKeys: ["cnvr.screen", "input.exe_stays", "solve.key", "display.format"],
  };
}

function buildCash(plan: Extract<CalcPlan, { kind: "cash" }>, options: BuildOptions): CalcSequence {
  const steps: CalcStep[] = [{ keys: ["CASH"], explanation: "כניסה למצב תזרימי מזומנים (CASH)." }];
  if (plan.i !== undefined) {
    steps.push({ keys: [...numberToKeys(plan.i), "EXE"], explanation: `בשורה I% מקלידים ${plan.i}: שיעור ההיוון באחוזים.`, expectDisplay: `I%=${plan.i}` });
  }
  steps.push({ keys: ["DOWN", "EXE"], explanation: "יורדים לשורה Csh ופותחים את עורך התזרימים ב-EXE.", expectDisplay: "D.Editor" });
  steps.push({ keys: ["CLR_DATA"], explanation: "מנקים את התזרימים הישנים בעורך לפי ההוראות במדריך, לפני ההזנה." });
  plan.flows.forEach((flow, t) => {
    steps.push({
      keys: [...numberToKeys(flow), "EXE"],
      explanation: `תזרים בזמן ${t}: ${flow}.${flow < 0 ? " השקעה היא כסף שיוצא, ולכן שלילית." : ""}`,
    });
  });
  steps.push({ keys: ["ESC"], explanation: "ESC חוזר למסך המשתנים." });
  const downs = plan.solveFor === "NPV" ? 1 : 2;
  steps.push({ keys: Array(downs).fill("DOWN"), explanation: `יורדים לשורה ${plan.solveFor}.` });
  steps.push({ keys: ["SOLVE"], explanation: `לוחצים SOLVE לחישוב ${plan.solveFor}.`, expectDisplay: options.expectedDisplay });
  return {
    model: "casio-fc-200v",
    mode: "CASH",
    modeExplanation: "מצב CASH מחשב NPV ו-IRR לסדרת תזרימים לא אחידה. התזרים הראשון הוא זמן 0.",
    reset: { required: true, note: "חובה לנקות את עורך התזרימים לפני ההזנה. נתוני CASH ו-STAT חולקים זיכרון." },
    inputs: [
      ...(plan.i !== undefined ? [{ variable: "I%", value: String(plan.i), meaning: "שיעור היוון" }] : []),
      { variable: "Csh", value: plan.flows.join(", "), meaning: "תזרימים לפי סדר הזמנים" },
    ],
    steps,
    result: { variable: plan.solveFor, display: options.expectedDisplay, meaning: options.resultMeaning },
    commonMistakes: ["לשכוח את התזרים בזמן 0 (ההשקעה).", "להשאיר תזרימים ישנים בעורך.", ...(options.commonMistakes ?? [])],
    factKeys: ["cash.screen", "cash.editor", "cash.editor_clear", "input.neg", "input.exe_stays", "solve.key", "display.format"],
  };
}

function buildComp(expression: CompToken[], options: BuildOptions): CalcSequence {
  const keys: string[] = [];
  const factKeys = new Set(["comp.entry", "display.format"]);
  const parts: string[] = [];
  for (const token of expression) {
    if ("num" in token) {
      keys.push(...numberToKeys(token.num));
      parts.push(String(token.num));
    } else if ("fn" in token) {
      keys.push(token.fn === "nCr" ? "NCR" : "NPR");
      factKeys.add(token.fn === "nCr" ? "comp.ncr" : "comp.npr");
      parts.push(` ${token.fn} `);
    } else if ("postfix" in token) {
      keys.push("FACT");
      factKeys.add("comp.factorial");
      parts.push("!");
    } else if ("op" in token) {
      keys.push({ "+": "ADD", "-": "SUB", "×": "MUL", "÷": "DIV" }[token.op]);
      parts.push(` ${token.op} `);
    } else {
      keys.push(token.paren === "(" ? "LPAREN" : "RPAREN");
      parts.push(token.paren);
    }
  }
  const shown = parts.join("").replace(/\s+/g, " ").trim();
  return {
    model: "casio-fc-200v",
    mode: "COMP",
    modeExplanation: "מצב COMP הוא מצב החישוב הרגיל. בו נמצאות הפונקציות nCr, nPr ו-x!.",
    reset: { required: false, note: "אין צורך באיפוס." },
    inputs: [{ variable: "ביטוי", value: shown, meaning: "החישוב שמקלידים" }],
    steps: [
      { keys: ["COMP"], explanation: "מעבר למצב חישוב רגיל (COMP)." },
      { keys, explanation: `מקלידים: ${shown}` },
      { keys: ["EXE"], explanation: "EXE מציג את התוצאה.", expectDisplay: options.expectedDisplay },
    ],
    result: { variable: "תוצאה", display: options.expectedDisplay, meaning: options.resultMeaning },
    commonMistakes: options.commonMistakes ?? [],
    factKeys: [...factKeys],
  };
}

export type { CmpdVariable };
