import * as z from "zod/v4";
import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { newId, nowIso, slugify } from "../lib/ids";
import { parseJson } from "../lib/json";
import { getCalculator } from "../calculator";
import { SUPPORTED_FUNCTIONS } from "../math/expression";
import { buildCalculatorSolution, contentHash, verifyQuestion } from "../content/verify";
import { buildProductionPackage } from "../notebook/production-package";
import type { LlmClient } from "./client";
import { calculatorToolInput, planFromToolInput } from "./tools";
import type { LessonRow, UnitRow } from "../services/types";

/**
 * Content engine: Claude drafts, deterministic code verifies, humans approve.
 *
 * Every job's output is stored in content_jobs first. "Apply" turns it into
 * draft/review rows; nothing here can publish or approve content.
 */
const SYSTEM = `You are a senior curriculum designer for a Hebrew course that prepares candidates for the Israeli pension-advisor licensing exam (finance and statistics).
All student-facing text you produce must be in clear Hebrew. Field names stay in English.
Base everything on the provided authorised materials. Do not invent regulations, numbers or facts that are not in them.
Calculator-first: every calculation question gets a calculator plan for the course's financial calculator (CASIO FC-200V) in the structured "calculator" field (mode + inputs, never key presses). Use CMPD for single sums and level payments, CNVR for nominal/effective conversion, COMP with nCr/nPr/factorial for counting. If the calculator cannot solve the question appropriately, set calculator to null; a formula solution is always required.
Every calculation question also needs an independent "check_expression" in the math engine syntax, whose value equals the numeric value of the correct option (same units: percent as a number like 12.68, money in shekels). Supported functions: ${SUPPORTED_FUNCTIONS.join(", ")}. Rates inside functions are decimals (0.05).
Distractors must reflect real student mistakes (simple instead of compound interest, wrong P/Y, End vs Begin, nPr vs nCr) and differ from the correct value by more than rounding.`;

const syllabusSchema = z.object({
  units: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      lessons: z.array(z.object({ title: z.string(), description: z.string(), objectives: z.array(z.string()) })),
    }),
  ),
});

const calculatorPlanSchema = calculatorToolInput;

const lessonPlanSchema = z.object({
  summary_md: z.string(),
  objectives: z.array(z.string()),
  formulas: z.array(z.object({ name: z.string(), formula: z.string(), meaning: z.string() })),
  examples: z.array(
    z.object({
      title: z.string(),
      problem: z.string(),
      formula_solution: z.string(),
      check_expression: z.string().nullable(),
      calculator: calculatorPlanSchema.nullable(),
      interpretation: z.string(),
    }),
  ),
});

const questionsSchema = z.object({
  questions: z.array(
    z.object({
      difficulty: z.number().int().min(1).max(3),
      role: z.enum(["practice", "quiz"]),
      stem: z.string(),
      options: z.array(z.object({ key: z.enum(["a", "b", "c", "d"]), text: z.string(), value: z.number().nullable() })),
      correct: z.enum(["a", "b", "c", "d"]),
      explanation: z.string(),
      formula_steps: z.array(z.object({ title: z.string(), body: z.string() })),
      check_expression: z.string().nullable(),
      tolerance: z.number().nullable(),
      calculator: calculatorPlanSchema.nullable(),
      calculator_compare: z.enum(["same", "abs"]).nullable(),
      interpretation: z.string().nullable(),
      common_mistake: z.string().nullable(),
    }),
  ),
});

export type JobKind = "syllabus_split" | "lesson_plan" | "questions" | "solutions" | "notebook_sources";

export class ContentEngine {
  constructor(private readonly db: SqlDb, private readonly llm: LlmClient) {}

  private async startJob(actor: User, kind: JobKind, targetType: string | null, targetId: string | null, input: unknown) {
    const id = newId("job");
    await this.db.run("INSERT INTO content_jobs (id, kind, target_type, target_id, input_json, status, model, created_by) VALUES (?,?,?,?,?,'running',?,?)", [
      id, kind, targetType, targetId, JSON.stringify(input), this.llm.model, actor.id,
    ]);
    return id;
  }

  private async finishJob(id: string, output: unknown, usage: unknown) {
    await this.db.run("UPDATE content_jobs SET status = 'done', output_json = ?, usage_json = ?, finished_at = ? WHERE id = ?", [
      JSON.stringify(output), JSON.stringify(usage ?? null), nowIso(), id,
    ]);
  }

  private async failJob(id: string, error: unknown) {
    await this.db.run("UPDATE content_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", [
      error instanceof Error ? error.message : String(error), nowIso(), id,
    ]);
  }

  private async materials(courseId: string): Promise<string> {
    const rows = await this.db.all<{ kind: string; title: string; text_content: string }>(
      "SELECT kind, title, text_content FROM course_materials WHERE course_id = ? ORDER BY kind, created_at",
      [courseId],
    );
    if (!rows.length) throw new Error("אין חומרי לימוד מורשים בקורס. יש להעלות סילבוס או חומרי מקור לפני יצירת תוכן.");
    return rows.map((r) => `### [${r.kind}] ${r.title}\n${r.text_content}`).join("\n\n").slice(0, 400_000);
  }

  /** 1-2: syllabus + authorised materials -> units and lessons (draft outlines). */
  async splitSyllabus(actor: User, courseId: string) {
    const jobId = await this.startJob(actor, "syllabus_split", "course", courseId, {});
    try {
      const result = await this.llm.structured({
        system: SYSTEM,
        prompt: `Authorised materials:\n${await this.materials(courseId)}\n\nSplit the official syllabus into units and lessons for a calculator-first course. Combinatorics belongs inside Statistics & Probability, never as a separate unit.`,
        schema: syllabusSchema,
        effort: "high",
      });
      await this.finishJob(jobId, result.data, result.usage);
      return { jobId, output: result.data };
    } catch (error) {
      await this.failJob(jobId, error);
      throw error;
    }
  }

  /** 3: Hebrew lesson plan (summary, formulas, worked examples with calculator plans). */
  async lessonPlan(actor: User, lessonId: string) {
    const lesson = await this.lesson(lessonId);
    const jobId = await this.startJob(actor, "lesson_plan", "lesson", lessonId, {});
    try {
      const result = await this.llm.structured({
        system: SYSTEM,
        prompt: `Authorised materials:\n${await this.materials(lesson.courseId)}\n\nWrite the lesson plan for "${lesson.row.title}" (${lesson.row.description}). Objectives so far: ${lesson.row.objectives_json}. Include 1-2 worked examples with calculator plans and check expressions.`,
        schema: lessonPlanSchema,
        effort: "high",
      });
      await this.finishJob(jobId, result.data, result.usage);
      return { jobId, output: result.data };
    } catch (error) {
      await this.failJob(jobId, error);
      throw error;
    }
  }

  /** 4-6: questions at several difficulty levels with graded solutions, verified against the math engine. */
  async questions(actor: User, lessonId: string, count: number, difficulties: number[]) {
    const lesson = await this.lesson(lessonId);
    const jobId = await this.startJob(actor, "questions", "lesson", lessonId, { count, difficulties });
    try {
      const result = await this.llm.structured({
        system: SYSTEM,
        prompt: `Authorised materials:\n${await this.materials(lesson.courseId)}\n\nLesson: "${lesson.row.title}".\nLesson summary:\n${lesson.row.summary_md}\n\nWrite ${Math.min(count, 10)} multiple-choice questions (4 options each) at difficulty levels ${difficulties.join(", ")}, each with a short explanation, step-by-step formula solution, check_expression, and a calculator plan when the FC-200V solves it.`,
        schema: questionsSchema,
        effort: "high",
      });
      const model = lesson.model;
      const verified = result.data.questions.map((q) => {
        let calculator = null;
        let buildError: string | null = null;
        if (q.calculator) {
          try {
            const plan = planFromToolInput(q.calculator);
            const { build, simulate } = getCalculator(model);
            const probe = simulate(build(plan, { expectedDisplay: "", resultMeaning: "" }));
            calculator = {
              plan,
              expectedDisplay: probe.finalDisplay,
              compare: q.calculator_compare ?? "abs",
              resultMeaning: "התוצאה במחשבון",
              interpretation: q.interpretation ?? "",
              mistakes: q.common_mistake ? [q.common_mistake] : [],
            };
          } catch (error) {
            buildError = error instanceof Error ? error.message : String(error);
          }
        }
        const options = q.options.map((o) => ({ key: o.key, text: o.text, value: o.value ?? undefined }));
        const check = q.check_expression ? { expression: q.check_expression, tolerance: q.tolerance ?? 0.01 } : undefined;
        const report = verifyQuestion({ options, correct: q.correct, check, calculator }, model);
        if (buildError) {
          report.checks.push({ label: "בניית תוכנית המחשבון", ok: false, detail: buildError });
          report.status = "failed";
        }
        return { draft: q, options, check, calculator, report };
      });
      await this.finishJob(jobId, verified, result.usage);
      return { jobId, output: verified };
    } catch (error) {
      await this.failJob(jobId, error);
      throw error;
    }
  }

  /** Applies a finished job as draft/review content. Generated questions always land in "review". */
  async apply(actor: User, jobId: string) {
    const job = await this.db.get<{ id: string; kind: JobKind; target_id: string | null; output_json: string | null; status: string }>("SELECT * FROM content_jobs WHERE id = ?", [jobId]);
    if (!job || job.status !== "done" || !job.output_json) throw new Error("המשימה אינה מוכנה להחלה");
    if (job.kind === "questions") {
      const items = parseJson<Array<{ draft: z.infer<typeof questionsSchema>["questions"][number]; options: unknown; check: unknown; calculator: Parameters<typeof buildCalculatorSolution>[0] | null; report: unknown }>>(job.output_json, []);
      const lesson = await this.lesson(job.target_id!);
      const base = await this.db.get<{ n: number }>("SELECT COALESCE(MAX(position),0) AS n FROM questions WHERE lesson_id = ?", [lesson.row.id]);
      let position = Number(base?.n ?? 0);
      for (const item of items) {
        const solution = item.calculator ? buildCalculatorSolution(item.calculator, lesson.model) : null;
        await this.db.run(
          `INSERT INTO questions (id, lesson_id, position, difficulty, stem_md, options_json, correct_key, short_explanation_md, solution_steps_json,
             calculator_json, verification_json, source, status, role, content_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,'ai','review',?,?)`,
          [
            newId("q"), lesson.row.id, ++position, item.draft.difficulty, item.draft.stem, JSON.stringify(item.options), item.draft.correct,
            item.draft.explanation, JSON.stringify(item.draft.formula_steps),
            solution ? JSON.stringify({ ...solution, compare: item.calculator!.compare, mistakes: item.calculator!.mistakes ?? [] }) : null,
            JSON.stringify({ ...(item.report as object), check: item.check ?? null }), item.draft.role, contentHash(item.draft),
          ],
        );
      }
    } else if (job.kind === "lesson_plan") {
      const plan = parseJson<z.infer<typeof lessonPlanSchema>>(job.output_json, { summary_md: "", objectives: [], formulas: [], examples: [] });
      const lesson = await this.lesson(job.target_id!);
      const examples = plan.examples.map((e) => {
        let calculator = null;
        try {
          if (e.calculator) {
            const p = planFromToolInput(e.calculator);
            const { build, simulate } = getCalculator(lesson.model);
            const probe = simulate(build(p, { expectedDisplay: "", resultMeaning: "" }));
            const solution = buildCalculatorSolution({ plan: p, expectedDisplay: probe.finalDisplay, compare: "abs", resultMeaning: "התוצאה במחשבון", interpretation: e.interpretation }, lesson.model);
            calculator = { ...solution, compare: "abs" as const };
          }
        } catch {
          calculator = null;
        }
        return { title: e.title, problem_md: e.problem, solution_md: e.formula_solution, calculator, verification: null };
      });
      await this.db.run(
        "UPDATE lessons SET summary_md = ?, objectives_json = ?, formulas_json = ?, examples_json = ?, status = 'review' WHERE id = ?",
        [plan.summary_md, JSON.stringify(plan.objectives), JSON.stringify(plan.formulas), JSON.stringify(examples), lesson.row.id],
      );
    } else if (job.kind === "syllabus_split") {
      const output = parseJson<z.infer<typeof syllabusSchema>>(job.output_json, { units: [] });
      const course = await this.db.get<{ id: string }>("SELECT id FROM courses ORDER BY created_at LIMIT 1");
      const base = await this.db.get<{ n: number }>("SELECT COALESCE(MAX(position),0) AS n FROM units WHERE course_id = ?", [course!.id]);
      let unitPos = Number(base?.n ?? 0);
      for (const unit of output.units) {
        const unitId = newId("unit");
        await this.db.run("INSERT INTO units (id, course_id, position, slug, title, description_md, status) VALUES (?,?,?,?,?,?,'draft')", [
          unitId, course!.id, ++unitPos, `${slugify(unit.title)}-${unitId.slice(-6)}`, unit.title, unit.description,
        ]);
        for (const [i, lesson] of unit.lessons.entries()) {
          const lessonId = newId("lsn");
          await this.db.run(
            "INSERT INTO lessons (id, unit_id, position, slug, title, description, objectives_json, access, status) VALUES (?,?,?,?,?,?,?,'paid','draft')",
            [lessonId, unitId, i + 1, `${slugify(lesson.title)}-${lessonId.slice(-6)}`, lesson.title, lesson.description, JSON.stringify(lesson.objectives)],
          );
        }
      }
    }
    await this.db.run("UPDATE content_jobs SET status = 'applied' WHERE id = ?", [jobId]);
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), actor.id, "content.apply", "job", jobId, JSON.stringify({ kind: job.kind }),
    ]);
  }

  /** 7: NotebookLM source documents for a lesson, assembled only from verified content. */
  async notebookSources(lessonId: string) {
    const lesson = await this.lesson(lessonId);
    const pkg = buildProductionPackage({
      targetType: "lesson",
      title: lesson.row.title,
      lessonTitle: lesson.row.title,
      lessonSummary: lesson.row.summary_md,
      formulas: parseJson(lesson.row.formulas_json, []),
      examples: parseJson<Array<{ title: string; problem_md: string; solution_md: string }>>(lesson.row.examples_json, []).map((e) => ({ title: e.title, problem: e.problem_md, solution: e.solution_md, calculator: null })),
      calculatorModel: lesson.model,
    });
    return pkg.sources;
  }

  async listJobs(limit = 30) {
    return this.db.all<{ id: string; kind: string; target_type: string | null; target_id: string | null; status: string; error: string | null; model: string | null; created_at: string; finished_at: string | null }>(
      "SELECT id, kind, target_type, target_id, status, error, model, created_at, finished_at FROM content_jobs ORDER BY created_at DESC LIMIT ?",
      [limit],
    );
  }

  async getJob(id: string) {
    return this.db.get<{ id: string; kind: string; status: string; output_json: string | null; error: string | null; target_id: string | null }>("SELECT * FROM content_jobs WHERE id = ?", [id]);
  }

  private async lesson(lessonId: string) {
    const row = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [lessonId]);
    if (!row) throw new Error("שיעור לא נמצא");
    const unit = await this.db.get<UnitRow>("SELECT * FROM units WHERE id = ?", [row.unit_id]);
    const course = await this.db.get<{ calculator_model: string }>("SELECT calculator_model FROM courses WHERE id = ?", [unit!.course_id]);
    return { row, courseId: unit!.course_id, model: course?.calculator_model ?? "casio-fc-200v" };
  }
}

export async function addMaterial(db: SqlDb, actor: User, courseId: string, kind: "syllabus" | "source" | "regulation" | "other", title: string, text: string) {
  if (!title.trim() || !text.trim()) throw new Error("יש למלא כותרת ותוכן");
  const id = newId("mat");
  await db.run("INSERT INTO course_materials (id, course_id, kind, title, text_content, created_by) VALUES (?,?,?,?,?,?)", [
    id, courseId, kind, title.trim(), text.slice(0, 500_000), actor.id,
  ]);
  return id;
}
