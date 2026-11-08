import type { CalcPlan } from "../calculator/types";

export interface SeedCalculator {
  plan: CalcPlan;
  /** Exact final display the student should see. Checked by the simulator. */
  expectedDisplay: string;
  /** How the calculator result relates to the answer value: same number, or same absolute value (sign convention). */
  compare: "same" | "abs";
  resultMeaning: string;
  interpretation: string;
  mistakes?: string[];
}

export interface SeedQuestion {
  id: string;
  role: "practice" | "quiz";
  difficulty: 1 | 2 | 3;
  stem: string;
  options: Array<{ key: string; text: string; value?: number }>;
  correct: string;
  explanation: string;
  formulaSteps: Array<{ title: string; body: string }>;
  /** Independent math-engine check, in the same units as the options' `value`. */
  check?: { expression: string; tolerance: number };
  calculator?: SeedCalculator;
  tags?: string[];
}

export interface SeedExample {
  title: string;
  problem: string;
  formulaSolution: string;
  check?: { expression: string; expected: number; tolerance: number };
  calculator?: SeedCalculator;
}

export interface SeedLesson {
  id: string;
  slug: string;
  title: string;
  description: string;
  access: "free" | "paid";
  status: "draft" | "review" | "published";
  minutes: number;
  objectives: string[];
  summary: string;
  formulas: Array<{ name: string; formula: string; meaning: string }>;
  examples: SeedExample[];
  questions: SeedQuestion[];
}

export interface SeedUnit {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "review" | "published";
  lessons: SeedLesson[];
}

export interface SeedCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  priceIls: number;
  trialDays: number;
  calculatorModel: string;
  units: SeedUnit[];
}
