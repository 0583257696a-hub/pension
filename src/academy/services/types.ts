import type { CalculatorSolution } from "../calculator/types";
import type { VerificationReport } from "../content/verify";

export interface CourseRow {
  id: string; slug: string; title: string; subtitle: string; description_md: string; status: string;
  price_ils: number; trial_days: number; calculator_model: string;
}
export interface UnitRow { id: string; course_id: string; position: number; slug: string; title: string; description_md: string; status: string }
export interface LessonRow {
  id: string; unit_id: string; position: number; slug: string; title: string; description: string; summary_md: string;
  formulas_json: string; examples_json: string; objectives_json: string; access: "free" | "paid";
  status: "draft" | "review" | "published"; estimated_minutes: number; video_asset_id: string | null;
}
export interface QuestionRow {
  id: string; lesson_id: string; position: number; difficulty: number; stem_md: string; options_json: string; correct_key: string;
  short_explanation_md: string; solution_steps_json: string; calculator_json: string | null; verification_json: string;
  source: string; status: "draft" | "review" | "approved" | "rejected"; solution_video_asset_id: string | null; role: "practice" | "quiz";
}
export interface QuizRow {
  id: string; course_id: string; unit_id: string | null; lesson_id: string | null; kind: "lesson" | "unit" | "simulation";
  title: string; question_ids_json: string; pass_score: number; time_limit_minutes: number | null; status: string;
}

export interface StoredCalculator extends CalculatorSolution {
  compare: "same" | "abs";
  mistakes?: string[];
}

/** What a student sees BEFORE answering. Never contains the correct key or the solution. */
export interface StudentQuestion {
  id: string;
  lessonId: string;
  difficulty: number;
  stem: string;
  options: Array<{ key: string; text: string }>;
  role: "practice" | "quiz";
  hasCalculatorSolution: boolean;
  hasVideo: boolean;
}

/** The single solution record, revealed after answering, with its presentation methods. */
export interface SolutionPresentation {
  questionId: string;
  correctKey: string;
  explanation: string;
  /** Present only when the sequence is fully verified (simulator + confirmed facts). */
  calculator: (StoredCalculator & { modelName: string }) | null;
  /** Why the calculator tab is absent, for staff. */
  calculatorUnavailableReason: string | null;
  formulaSteps: Array<{ title: string; body_md: string }>;
  /** True when the question involves a calculation (formula tab label differs for conceptual questions). */
  isCalculation: boolean;
  video: { id: string; url: string; title: string } | null;
  verification: VerificationReport & { check?: { expression: string; tolerance: number } | null };
}
