import { createHash } from "node:crypto";
import { getCalculator, type CalculatorSolution } from "../calculator";
import { evaluate } from "../math/expression";
import type { SeedCalculator } from "./types";

export interface VerificationCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface VerificationReport {
  /** verified: all automatic checks passed. failed: at least one failed. not_applicable: no calculation to check (conceptual question). */
  status: "verified" | "failed" | "not_applicable";
  engineValue: number | null;
  checks: VerificationCheck[];
  checkedAt: string;
}

export function buildCalculatorSolution(seed: SeedCalculator, modelId: string): CalculatorSolution {
  const { build, simulate } = getCalculator(modelId);
  const sequence = build(seed.plan, {
    expectedDisplay: seed.expectedDisplay,
    resultMeaning: seed.resultMeaning,
    commonMistakes: seed.mistakes,
  });
  const report = simulate(sequence);
  return {
    plan: seed.plan,
    sequence,
    resultValue: report.finalValue ?? Number.NaN,
    interpretation: seed.interpretation,
  };
}

export interface VerifiableQuestion {
  options: Array<{ key: string; text: string; value?: number }>;
  correct: string;
  check?: { expression: string; tolerance: number };
  calculator?: (SeedCalculator & { solution?: CalculatorSolution }) | null;
}

/**
 * Automatic verification of a question's single solution record:
 *  1. the independent math engine evaluates the check expression;
 *  2. the correct option matches it, and no distractor does;
 *  3. the calculator sequence replays in the simulator with every expected display;
 *  4. the calculator result matches the math engine.
 * Passing this does NOT publish anything: a reviewer still approves.
 */
export function verifyQuestion(q: VerifiableQuestion, modelId: string): VerificationReport {
  const checks: VerificationCheck[] = [];
  const checkedAt = new Date().toISOString();
  const keys = q.options.map((o) => o.key);
  checks.push({
    label: "התשובה הנכונה קיימת באפשרויות",
    ok: keys.includes(q.correct),
    detail: `מפתח נכון: ${q.correct}`,
  });
  checks.push({ label: "אין אפשרויות כפולות", ok: new Set(keys).size === keys.length, detail: keys.join(", ") });

  if (!q.check && !q.calculator) {
    const ok = checks.every((c) => c.ok);
    return { status: ok ? "not_applicable" : "failed", engineValue: null, checks, checkedAt };
  }
  if (!q.check) {
    checks.push({ label: "בדיקה מתמטית עצמאית", ok: false, detail: "לשאלה חישובית חייבת להיות בדיקה במנוע המתמטי" });
    return { status: "failed", engineValue: null, checks, checkedAt };
  }

  let engineValue: number | null = null;
  try {
    engineValue = evaluate(q.check.expression);
    checks.push({ label: "חישוב במנוע המתמטי", ok: true, detail: `${q.check.expression} = ${engineValue}` });
  } catch (error) {
    checks.push({ label: "חישוב במנוע המתמטי", ok: false, detail: error instanceof Error ? error.message : String(error) });
    return { status: "failed", engineValue: null, checks, checkedAt };
  }

  const tolerance = q.check.tolerance;
  const correctOption = q.options.find((o) => o.key === q.correct);
  if (correctOption?.value === undefined) {
    checks.push({ label: "ערך מספרי לתשובה הנכונה", ok: false, detail: "חסר value לאפשרות הנכונה" });
  } else {
    const diff = Math.abs(correctOption.value - engineValue);
    checks.push({
      label: "התשובה הנכונה תואמת את המנוע",
      ok: diff <= Math.max(tolerance, 1e-9),
      detail: `${correctOption.value} מול ${engineValue} (סטייה ${diff.toPrecision(3)}, מותר ${tolerance})`,
    });
  }
  const collisions = q.options.filter(
    (o) => o.key !== q.correct && o.value !== undefined && Math.abs(o.value - engineValue!) <= Math.max(tolerance, 1e-9),
  );
  checks.push({
    label: "אף מסיח אינו נכון בטעות",
    ok: collisions.length === 0,
    detail: collisions.length ? `מסיחים קרובים מדי: ${collisions.map((o) => o.key).join(", ")}` : "תקין",
  });

  if (q.calculator) {
    const { simulate } = getCalculator(modelId);
    let solution = q.calculator.solution;
    try {
      solution ??= buildCalculatorSolution(q.calculator, modelId);
      const report = simulate(solution.sequence);
      checks.push({
        label: "סימולציית רצף המקשים",
        ok: report.ok,
        detail: report.ok ? `התצוגה הסופית: ${report.finalDisplay}` : report.errors.join(" | "),
      });
      if (report.ok && report.finalValue !== null) {
        const calcValue = q.calculator.compare === "abs" ? Math.abs(report.finalValue) : report.finalValue;
        const diff = Math.abs(calcValue - engineValue);
        checks.push({
          label: "תוצאת המחשבון תואמת את המנוע",
          ok: diff <= Math.max(1e-6 * Math.abs(engineValue), 1e-6),
          detail: `${calcValue} מול ${engineValue}`,
        });
        if (correctOption?.value !== undefined) {
          checks.push({
            label: "תוצאת המחשבון מובילה לתשובה הנכונה",
            ok: Math.abs(calcValue - correctOption.value) <= Math.max(tolerance, 1e-9),
            detail: `${calcValue} מול ${correctOption.value}`,
          });
        }
      }
    } catch (error) {
      checks.push({ label: "בניית רצף המקשים", ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  return { status: checks.every((c) => c.ok) ? "verified" : "failed", engineValue, checks, checkedAt };
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
