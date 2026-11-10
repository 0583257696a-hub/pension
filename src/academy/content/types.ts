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

/** An academic chapter from the reference syllabus (14 chapters in 3 parts). */
export interface SeedChapter {
  id: string;
  number: number;
  part: "finance" | "statistics" | "investments";
  title: string;
  topics: string[];
}

/** A pause point in the lesson video: the student tries a lesson question before the explanation. */
export interface SeedCheckpoint {
  /** Seconds into the lesson video. Null until the produced video is timed by an editor. */
  atSeconds: number | null;
  /** 1-based number of the lesson question (same number as in the questions PDF). */
  question: number;
  title: string;
}

export interface SeedLesson {
  id: string;
  slug: string;
  /** Course-wide lesson number shown to students ("שיעור 1"). */
  number: number;
  /** Chapter numbers this lesson covers. */
  chapters: number[];
  /** Topics shown in the lesson header. */
  topics: string[];
  checkpoints?: SeedCheckpoint[];
  /** Player chapters for skipping to a topic. */
  videoChapters?: Array<{ atSeconds: number | null; title: string }>;
  /** Number of questions the homework assignment must have before it can be published (default 20). */
  assignmentSize?: number;
  title: string;
  description: string;
  access: "free" | "paid";
  status: "draft" | "review" | "published";
  minutes: number;
  objectives: string[];
  summary: string;
  formulas: Array<{ name: string; formula: string; meaning: string }>;
  /** Lesson questions: solved by the instructor in the video and printed, in this order, in the questions PDF. */
  examples: SeedExample[];
  /** Homework assignment questions, in assignment order. */
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
  chapters: SeedChapter[];
  plans: Array<{ id: string; kind: "one_time" | "monthly" | "annual"; title: string; priceAgorot: number; accessDays?: number }>;
  /** Parts of the course (finance, statistics, investments). Lessons are numbered across parts. */
  units: SeedUnit[];
}
