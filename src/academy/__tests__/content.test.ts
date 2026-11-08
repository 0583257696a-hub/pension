import { describe, expect, it } from "vitest";
import { financeStatisticsCourse } from "../content/course";
import { buildCalculatorSolution, verifyQuestion } from "../content/verify";
import { getCalculator } from "../calculator";

const model = financeStatisticsCourse.calculatorModel;
const allQuestions = financeStatisticsCourse.units.flatMap((u) => u.lessons.flatMap((l) => l.questions.map((q) => ({ unit: u, lesson: l, q }))));

describe("course structure", () => {
  it("places combinatorics inside Statistics & Probability, with no standalone module", () => {
    const titles = financeStatisticsCourse.units.map((u) => u.title);
    expect(titles.some((t) => /קומבינטוריקה/.test(t) && /סטטיסטיקה והסתברות/.test(t))).toBe(true);
    expect(titles.filter((t) => /קומבינטוריקה/.test(t))).toHaveLength(1);
    const probability = financeStatisticsCourse.units.find((u) => u.id === "unit_probability")!;
    const lessonTitles = probability.lessons.map((l) => l.title).join(" | ");
    for (const topic of ["עקרון הספירה", "עצרת", "תמורות", "צירופים", "עם חזרות", "הסתברות"]) {
      expect(lessonTitles).toContain(topic);
    }
  });
  it("uses unique ids everywhere", () => {
    const ids = [
      ...financeStatisticsCourse.units.map((u) => u.id),
      ...financeStatisticsCourse.units.flatMap((u) => u.lessons.map((l) => l.id)),
      ...allQuestions.map((x) => x.q.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("has a fully built first unit", () => {
    const unit1 = financeStatisticsCourse.units[0];
    expect(unit1.lessons.length).toBeGreaterThanOrEqual(3);
    for (const lesson of unit1.lessons) {
      expect(lesson.summary.length).toBeGreaterThan(100);
      expect(lesson.formulas.length).toBeGreaterThan(0);
      expect(lesson.examples.length).toBeGreaterThan(0);
      expect(lesson.questions.filter((q) => q.role === "practice").length).toBeGreaterThan(0);
      expect(lesson.questions.filter((q) => q.role === "quiz").length).toBeGreaterThan(0);
    }
  });
});

describe("every question's single solution record verifies", () => {
  it.each(allQuestions.map((x) => [x.q.id, x.q] as const))("%s", (_id, q) => {
    const report = verifyQuestion(q, model);
    const failed = report.checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    if (q.check || q.calculator) expect(report.status).toBe("verified");
  });

  it("every calculation question in unit 1 has a calculator solution", () => {
    const unit1 = financeStatisticsCourse.units[0];
    for (const lesson of unit1.lessons) {
      for (const q of lesson.questions) {
        if (q.check) expect(q.calculator, q.id).toBeDefined();
      }
    }
  });

  it("every worked example verifies", () => {
    for (const unit of financeStatisticsCourse.units) {
      for (const lesson of unit.lessons) {
        for (const example of lesson.examples) {
          if (!example.calculator) continue;
          const solution = buildCalculatorSolution(example.calculator, model);
          const report = getCalculator(model).simulate(solution.sequence);
          expect(report.errors, example.title).toEqual([]);
          const report2 = verifyQuestion(
            { options: [{ key: "x", text: "", value: example.check!.expected }], correct: "x", check: example.check, calculator: { ...example.calculator, solution } },
            model,
          );
          expect(report2.checks.filter((c) => !c.ok), example.title).toEqual([]);
        }
      }
    }
  });
});
