import * as z from "zod/v4";
import { getCalculator, verdictFor, type CalcPlan, type FactStatus } from "../calculator";
import { evaluate, SUPPORTED_FUNCTIONS } from "../math/expression";
import type { ToolDefinition } from "./client";

/**
 * Deterministic tools for Claude. Numbers the tutor states come from these
 * tools, not from the model's own arithmetic, and calculator key sequences are
 * produced by the builders + simulator, never invented by the model.
 */
export const mathToolInput = z.object({ expression: z.string().min(1).max(500) });

export const calculatorToolInput = z.object({
  mode: z.enum(["CMPD", "CNVR", "COMP"]),
  set: z.enum(["End", "Begin"]).optional(),
  n: z.number().optional(),
  i: z.number().optional(),
  pv: z.number().optional(),
  pmt: z.number().optional(),
  fv: z.number().optional(),
  py: z.number().optional(),
  cy: z.number().optional(),
  solve_for: z.string().optional(),
  comp_function: z.enum(["nCr", "nPr", "factorial"]).optional(),
  a: z.number().int().optional(),
  b: z.number().int().optional(),
});

export const TUTOR_TOOLS: ToolDefinition[] = [
  {
    name: "evaluate_math",
    description: `Evaluates an arithmetic expression with the course's verified math engine. Use it for EVERY number you present. Supported functions: ${SUPPORTED_FUNCTIONS.join(", ")}. Rates are decimals (0.05). Arrays use [a, b, c].`,
    input_schema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    eager_input_streaming: true,
  },
  {
    name: "fc200v_sequence",
    description:
      "Builds the exact CASIO FC-200V key sequence for a calculation and replays it in the deterministic simulator. Returns the steps and the final display ONLY when every calculator fact it relies on is confirmed; otherwise returns not_verified and you must explain with the formula instead. Modes: CMPD (set, n, i as annual percent, pv, pmt, fv, py, cy, solve_for one of n, I%, PV, PMT, FV; give every value except the one solved), CNVR (n = compoundings per year, i = rate in percent, solve_for EFF or APR), COMP (comp_function nCr/nPr with a and b, or factorial with a).",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["CMPD", "CNVR", "COMP"] },
        set: { type: "string", enum: ["End", "Begin"] },
        n: { type: "number" }, i: { type: "number" }, pv: { type: "number" }, pmt: { type: "number" }, fv: { type: "number" },
        py: { type: "number" }, cy: { type: "number" },
        solve_for: { type: "string" },
        comp_function: { type: "string", enum: ["nCr", "nPr", "factorial"] },
        a: { type: "integer" }, b: { type: "integer" },
      },
      required: ["mode"],
    },
    eager_input_streaming: true,
  },
];

export function planFromToolInput(input: z.infer<typeof calculatorToolInput>): CalcPlan {
  if (input.mode === "CMPD") {
    const solveFor = input.solve_for as "n" | "I%" | "PV" | "PMT" | "FV";
    if (!["n", "I%", "PV", "PMT", "FV"].includes(solveFor)) throw new Error("solve_for must be n, I%, PV, PMT or FV");
    return { kind: "cmpd", set: input.set ?? "End", n: input.n, i: input.i, pv: input.pv, pmt: input.pmt, fv: input.fv, py: input.py ?? 1, cy: input.cy ?? 1, solveFor };
  }
  if (input.mode === "CNVR") {
    if (input.n === undefined || input.i === undefined) throw new Error("CNVR needs n and i");
    if (input.solve_for !== "EFF" && input.solve_for !== "APR") throw new Error("solve_for must be EFF or APR");
    return { kind: "cnvr", n: input.n, i: input.i, solveFor: input.solve_for };
  }
  if (input.comp_function === "factorial") {
    if (input.a === undefined) throw new Error("factorial needs a");
    return { kind: "comp", expression: [{ num: input.a }, { postfix: "factorial" }] };
  }
  if (!input.comp_function || input.a === undefined || input.b === undefined) throw new Error("COMP needs comp_function, a and b");
  return { kind: "comp", expression: [{ num: input.a }, { fn: input.comp_function }, { num: input.b }] };
}

export function runMathTool(raw: unknown) {
  const parsed = mathToolInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  try {
    return { ok: true, value: evaluate(parsed.data.expression) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function runCalculatorTool(raw: unknown, modelId: string, facts: Record<string, FactStatus>) {
  const parsed = calculatorToolInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  try {
    const plan = planFromToolInput(parsed.data);
    const { build, simulate, model } = getCalculator(modelId);
    // First pass discovers the display; the second pass checks the full sequence against it.
    const probe = simulate(build(plan, { expectedDisplay: "", resultMeaning: "" }));
    if (probe.steps.some((s) => s.error)) return { ok: false, error: probe.errors.join(" | ") };
    const sequence = build(plan, { expectedDisplay: probe.finalDisplay, resultMeaning: "" });
    const verdict = verdictFor(sequence, facts);
    if (!verdict.simulation.ok) return { ok: false, error: verdict.simulation.errors.join(" | ") };
    if (!verdict.verified) {
      return {
        ok: false,
        status: "not_verified",
        message: "The key sequence relies on calculator facts not yet confirmed by a reviewer. Do NOT give key presses; explain with the formula.",
        pending_facts: [...verdict.pendingFacts, ...verdict.rejectedFacts],
      };
    }
    return {
      ok: true,
      model: model.name,
      mode: sequence.mode,
      steps: sequence.steps.map((s) => ({ keys: s.keys.map((k) => model.keys[k]?.press?.map((p) => model.keys[p]?.label ?? p).join(" ") ?? model.keys[k]?.label ?? k), explanation: s.explanation, display: s.expectDisplay })),
      final_display: sequence.result.display,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
