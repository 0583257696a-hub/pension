import { describe, expect, it } from "vitest";
import { financeStatisticsCourse } from "../content/course";
import { buildCalculatorSolution, verifyQuestion } from "../content/verify";
import { getCalculator } from "../calculator";

const model = financeStatisticsCourse.calculatorModel;
const allQuestions = financeStatisticsCourse.units.flatMap((u) => u.lessons.flatMap((l) => l.questions.map((q) => ({ unit: u, lesson: l, q }))));

describe("course structure", () => {
  const lessons = financeStatisticsCourse.units.flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l })));

  it("has the 14 chapters in three parts, with combinatorics inside Statistics (no standalone module)", () => {
    const chapters = financeStatisticsCourse.chapters;
    expect(chapters.map((c) => c.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(chapters.filter((c) => c.part === "finance").map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chapters.filter((c) => c.part === "statistics").map((c) => c.number)).toEqual([7, 8, 9, 10, 11]);
    expect(chapters.filter((c) => c.part === "investments").map((c) => c.number)).toEqual([12, 13, 14]);
    expect(chapters.find((c) => c.number === 7)!.title).toBe("קומבינטוריקה");
    expect(financeStatisticsCourse.units.map((u) => u.title).some((t) => /קומבינטוריקה/.test(t))).toBe(false);
    const combinatorics = lessons.find((x) => x.lesson.chapters.includes(7))!;
    expect(combinatorics.unit.id).toBe("unit_statistics");
  });

  it("numbers lessons 1..N across the course and maps every chapter to a lesson", () => {
    expect(lessons.map((x) => x.lesson.number)).toEqual(Array.from({ length: lessons.length }, (_, i) => i + 1));
    const mapped = new Set(lessons.flatMap((x) => x.lesson.chapters));
    for (let n = 1; n <= 14; n++) expect(mapped.has(n), `chapter ${n}`).toBe(true);
  });

  it("uses unique ids everywhere", () => {
    const ids = [
      ...financeStatisticsCourse.units.map((u) => u.id),
      ...lessons.map((x) => x.lesson.id),
      ...allQuestions.map((x) => x.q.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(lessons.map((x) => x.lesson.slug)).size).toBe(lessons.length);
  });

  it("has a fully built Lesson 1: summary, formulas, lesson questions with checkpoints, and exactly 20 assignment questions", () => {
    const lesson = lessons[0].lesson;
    expect(lesson.title).toBe("שיעור 1 — מבוא לריביות ותזרימי מזומנים");
    expect(lesson.summary.length).toBeGreaterThan(300);
    expect(lesson.formulas.length).toBeGreaterThan(4);
    expect(lesson.examples.length).toBe(6);
    expect(lesson.examples.every((e) => e.calculator && e.check)).toBe(true);
    expect(lesson.checkpoints!.map((c) => c.question)).toEqual(lesson.examples.map((_, i) => i + 1));
    expect(lesson.questions).toHaveLength(lesson.assignmentSize ?? 20);
    expect(lesson.questions.every((q) => q.options.length === 4)).toBe(true);
  });

  it("teaches the course calculator convention: P/Y = C/Y = 1, I% per period", () => {
    for (const { lesson } of lessons) {
      for (const item of [...lesson.examples, ...lesson.questions]) {
        const plan = item.calculator?.plan;
        if (plan?.kind === "cmpd") expect([plan.py, plan.cy], `${lesson.id}: ${"id" in item ? item.id : item.title}`).toEqual([1, 1]);
      }
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

  it("every calculation question in the finance part has a calculator solution (calculator first)", () => {
    for (const lesson of financeStatisticsCourse.units[0].lessons) {
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
