/**
 * Calculator-first solution model.
 *
 * A question has ONE verified solution record. The calculator presentation is
 * stored as a `CalculatorSolution` next to the formula steps. AI never writes
 * key presses directly: it proposes a `CalcPlan` (mode + inputs + what to
 * solve), and deterministic builders turn the plan into a key sequence for a
 * specific calculator model. The simulator then replays the sequence.
 */
export type CalculatorModelId = "casio-fc-200v";

export type CmpdVariable = "n" | "I%" | "PV" | "PMT" | "FV";

export type CalcPlan =
  | {
      kind: "cmpd";
      set: "End" | "Begin";
      n?: number;
      i?: number; // annual rate in percent, e.g. 5 for 5%
      pv?: number;
      pmt?: number;
      fv?: number;
      py: number;
      cy: number;
      solveFor: CmpdVariable;
      /** Hebrew meaning of each entered value, shown next to the inputs. */
      meanings?: Partial<Record<CmpdVariable | "P/Y" | "C/Y", string>>;
    }
  | { kind: "cnvr"; n: number; i: number; solveFor: "EFF" | "APR" }
  | { kind: "cash"; i?: number; flows: number[]; solveFor: "NPV" | "IRR" }
  | { kind: "comp"; expression: CompToken[] };

export type CompToken =
  | { num: number }
  | { fn: "nCr" | "nPr" }
  | { postfix: "factorial" }
  | { op: "+" | "-" | "×" | "÷" }
  | { paren: "(" | ")" };

/** A single key on the device. Ids are model-specific (see the model's key catalog). */
export type KeyId = string;

export interface CalcStep {
  keys: KeyId[];
  /** Hebrew explanation of what this step does and why. */
  explanation: string;
  /** What the display must show after the step. Checked by the simulator when present. */
  expectDisplay?: string;
}

export interface CalcSequence {
  model: CalculatorModelId;
  mode: string;
  modeExplanation: string;
  reset: { required: boolean; note: string };
  inputs: Array<{ variable: string; value: string; meaning: string }>;
  steps: CalcStep[];
  result: { variable: string; display: string; meaning: string };
  commonMistakes: string[];
  /** Model facts this sequence depends on. All must be confirmed before students see it. */
  factKeys: string[];
}

export interface CalculatorSolution {
  plan: CalcPlan;
  sequence: CalcSequence;
  /** Numeric value of the final display, used to cross-check the math engine. */
  resultValue: number;
  /** Hebrew interpretation of the result in the question's context. */
  interpretation: string;
}

export interface SimulatedStep {
  index: number;
  display: string;
  expected?: string;
  ok: boolean;
  error?: string;
}

export interface SimulationReport {
  ok: boolean;
  steps: SimulatedStep[];
  finalDisplay: string;
  finalValue: number | null;
  errors: string[];
}

export interface CalculatorFact {
  key: string;
  /** Hebrew statement the reviewer confirms against the manual or the physical device. */
  statement: string;
  /** Where the statement comes from, or "unsourced" when it still needs a primary source. */
  source: string;
  sourced: boolean;
}

export interface CalculatorKey {
  id: KeyId;
  /** Label printed on the key (or the shifted label). */
  label: string;
  /** Physical presses needed, e.g. ["SHIFT", "DIV"] for a shifted function. */
  press?: KeyId[];
  factKey?: string;
}

export interface CalculatorModel {
  id: CalculatorModelId;
  name: string;
  displayDigits: number;
  keys: Record<KeyId, CalculatorKey>;
  facts: CalculatorFact[];
}
