import type { CalcSequence, CalculatorModel, CalculatorModelId, SimulationReport } from "./types";
import { FC200V } from "./fc200v/model";
import { simulate as simulateFc200v } from "./fc200v/simulator";
import { buildSequence as buildFc200v } from "./fc200v/builders";

export * from "./types";

const MODELS: Record<CalculatorModelId, { model: CalculatorModel; simulate: (s: CalcSequence) => SimulationReport; build: typeof buildFc200v }> = {
  "casio-fc-200v": { model: FC200V, simulate: simulateFc200v, build: buildFc200v },
};

export function getCalculator(id: string) {
  const entry = MODELS[id as CalculatorModelId];
  if (!entry) throw new Error(`דגם מחשבון לא נתמך: ${id}`);
  return entry;
}

export function listCalculatorModels(): CalculatorModel[] {
  return Object.values(MODELS).map((m) => m.model);
}

export type FactStatus = "pending" | "confirmed" | "rejected";

export interface CalculatorVerdict {
  /** True only when the simulator passes AND every fact is confirmed. */
  verified: boolean;
  simulation: SimulationReport;
  pendingFacts: string[];
  rejectedFacts: string[];
}

/**
 * Final verdict for one calculator sequence. `factStatus` comes from the
 * calculator_facts table (reviewer confirmations).
 */
export function verdictFor(sequence: CalcSequence, factStatus: Record<string, FactStatus>): CalculatorVerdict {
  const { simulate } = getCalculator(sequence.model);
  const simulation = simulate(sequence);
  const pendingFacts = sequence.factKeys.filter((k) => (factStatus[k] ?? "pending") === "pending");
  const rejectedFacts = sequence.factKeys.filter((k) => factStatus[k] === "rejected");
  return {
    verified: simulation.ok && pendingFacts.length === 0 && rejectedFacts.length === 0,
    simulation,
    pendingFacts,
    rejectedFacts,
  };
}
