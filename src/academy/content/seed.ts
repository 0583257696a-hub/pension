import type { SqlDb } from "../db/types";
import { getCalculator } from "../calculator";
import { newId } from "../lib/ids";
import type { SeedCourse, SeedLesson, SeedQuestion } from "./types";
import { buildCalculatorSolution, contentHash, verifyQuestion } from "./verify";

export interface SeedSummary {
  course: string;
  chapters: number;
  assignments: number;
  units: number;
  lessons: { inserted: number; updated: number; sentBackToReview: number };
  questions: { inserted: number; updated: number; sentBackToReview: number; verified: number; failed: number };
  facts: number;
}

/**
 * Idempotent import of a course definition.
 *  - Never deletes rows, so student progress, attempts and subscriptions stay intact
 *    when topics are reorganised (a lesson keeps its id when it moves to another unit).
 *  - New lessons and questions are imported in "review" (or "draft") status, never
 *    "published"/"approved": a reviewer approves them in the admin panel.
 *  - When imported content changes, the item goes back to review.
 */
export async function seedCourse(db: SqlDb, course: SeedCourse, actorId: string | null = null): Promise<SeedSummary> {
  const calculator = getCalculator(course.calculatorModel);
  const summary: SeedSummary = {
    course: course.id,
    chapters: 0,
    assignments: 0,
    units: 0,
    lessons: { inserted: 0, updated: 0, sentBackToReview: 0 },
    questions: { inserted: 0, updated: 0, sentBackToReview: 0, verified: 0, failed: 0 },
    facts: 0,
  };

  await db.run(
    `INSERT INTO courses (id, slug, title, subtitle, description_md, status, price_ils, trial_days, calculator_model)
     VALUES (?,?,?,?,?,'published',?,?,?)
     ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, title=excluded.title, subtitle=excluded.subtitle,
       description_md=excluded.description_md, calculator_model=excluded.calculator_model,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [course.id, course.slug, course.title, course.subtitle, course.description, course.priceIls, course.trialDays, course.calculatorModel],
  );

  for (const chapter of course.chapters) {
    await db.run(
      `INSERT INTO chapters (id, course_id, number, part, title, topics_json) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET number=excluded.number, part=excluded.part, title=excluded.title, topics_json=excluded.topics_json`,
      [chapter.id, course.id, chapter.number, chapter.part, chapter.title, JSON.stringify(chapter.topics)],
    );
    summary.chapters++;
  }
  // Plans are created once; prices and availability are then managed in the admin panel.
  for (const [index, plan] of course.plans.entries()) {
    await db.run(
      "INSERT OR IGNORE INTO plans (id, course_id, kind, title, price_agorot, access_days, active, position) VALUES (?,?,?,?,?,?,?,?)",
      [plan.id, course.id, plan.kind, plan.title, plan.priceAgorot, plan.accessDays ?? null, plan.kind === "monthly" ? 1 : 0, index + 1],
    );
  }

  for (const fact of calculator.model.facts) {
    const result = await db.run("INSERT OR IGNORE INTO calculator_facts (model, fact_key, status) VALUES (?,?,'pending')", [
      calculator.model.id,
      fact.key,
    ]);
    summary.facts += result.changes;
  }

  for (const [unitIndex, unit] of course.units.entries()) {
    summary.units++;
    await db.run(
      `INSERT INTO units (id, course_id, position, slug, title, description_md, status) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id, position=excluded.position, slug=excluded.slug,
         title=excluded.title, description_md=excluded.description_md`,
      [unit.id, course.id, unitIndex + 1, unit.slug, unit.title, unit.description, unit.status],
    );

    for (const [lessonIndex, lesson] of unit.lessons.entries()) {
      await upsertLesson(db, unit.id, lessonIndex + 1, lesson, course.calculatorModel, summary);
      for (const [qIndex, question] of lesson.questions.entries()) {
        await upsertQuestion(db, lesson.id, qIndex + 1, question, course.calculatorModel, summary);
      }
      await upsertLessonStructure(db, course, lesson);
      await upsertAssignment(db, course.id, lesson);
      summary.assignments++;
    }
  }

  await db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
    newId("aud"),
    actorId,
    "content.import",
    "course",
    course.id,
    JSON.stringify(summary),
  ]);
  return summary;
}

async function upsertLesson(db: SqlDb, unitId: string, position: number, lesson: SeedLesson, modelId: string, summary: SeedSummary) {
  const examples = lesson.examples.map((example) => {
    const solution = example.calculator ? buildCalculatorSolution(example.calculator, modelId) : null;
    const verification = example.check
      ? verifyQuestion(
          {
            options: [{ key: "x", text: "", value: example.check.expected }],
            correct: "x",
            check: { expression: example.check.expression, tolerance: example.check.tolerance },
            calculator: example.calculator ? { ...example.calculator, solution: solution ?? undefined } : null,
          },
          modelId,
        )
      : null;
    return {
      title: example.title,
      problem_md: example.problem,
      solution_md: example.formulaSolution,
      calculator: solution ? { ...solution, compare: example.calculator!.compare } : null,
      verification,
    };
  });
  const content = {
    slug: lesson.slug,
    title: lesson.title,
    description: lesson.description,
    summary: lesson.summary,
    formulas: lesson.formulas,
    examples,
    objectives: lesson.objectives,
    access: lesson.access,
    minutes: lesson.minutes,
  };
  const hash = contentHash({ ...content, examples: examples.map((e) => ({ ...e, verification: null })) });
  const existing = await db.get<{ content_hash: string | null; status: string }>("SELECT content_hash, status FROM lessons WHERE id = ?", [lesson.id]);
  if (!existing) {
    await db.run(
      `INSERT INTO lessons (id, unit_id, position, slug, title, description, summary_md, formulas_json, examples_json, objectives_json,
         access, status, estimated_minutes, content_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        lesson.id, unitId, position, lesson.slug, lesson.title, lesson.description, lesson.summary,
        JSON.stringify(lesson.formulas), JSON.stringify(examples), JSON.stringify(lesson.objectives),
        lesson.access, lesson.status === "draft" ? "draft" : "review", lesson.minutes, hash,
      ],
    );
    summary.lessons.inserted++;
    return;
  }
  const changed = existing.content_hash !== hash;
  const backToReview = changed && existing.status === "published";
  await db.run(
    `UPDATE lessons SET unit_id=?, position=?, slug=?, title=?, description=?, summary_md=?, formulas_json=?, examples_json=?,
       objectives_json=?, access=?, estimated_minutes=?, content_hash=?, status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=?`,
    [
      unitId, position, lesson.slug, lesson.title, lesson.description, lesson.summary, JSON.stringify(lesson.formulas),
      JSON.stringify(examples), JSON.stringify(lesson.objectives), lesson.access, lesson.minutes, hash,
      backToReview ? "review" : existing.status, lesson.id,
    ],
  );
  if (changed) summary.lessons.updated++;
  if (backToReview) summary.lessons.sentBackToReview++;
}

async function upsertQuestion(db: SqlDb, lessonId: string, position: number, q: SeedQuestion, modelId: string, summary: SeedSummary) {
  const solution = q.calculator ? buildCalculatorSolution(q.calculator, modelId) : null;
  const verification = verifyQuestion({ ...q, calculator: q.calculator ? { ...q.calculator, solution: solution ?? undefined } : null }, modelId);
  if (verification.status === "failed") summary.questions.failed++;
  if (verification.status === "verified") summary.questions.verified++;
  const calculatorJson = solution ? JSON.stringify({ ...solution, compare: q.calculator!.compare, mistakes: q.calculator!.mistakes ?? [] }) : null;
  const content = { stem: q.stem, options: q.options, correct: q.correct, explanation: q.explanation, steps: q.formulaSteps, calc: q.calculator ?? null, check: q.check ?? null };
  const hash = contentHash(content);
  const existing = await db.get<{ content_hash: string | null; status: string }>("SELECT content_hash, status FROM questions WHERE id = ?", [q.id]);
  const verificationJson = JSON.stringify({ ...verification, check: q.check ?? null });
  if (!existing) {
    await db.run(
      `INSERT INTO questions (id, lesson_id, position, difficulty, stem_md, options_json, correct_key, short_explanation_md,
         solution_steps_json, calculator_json, verification_json, source, status, tags_json, role, content_hash)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'ai','review',?,?,?)`,
      [
        q.id, lessonId, position, q.difficulty, q.stem, JSON.stringify(q.options), q.correct, q.explanation,
        JSON.stringify(q.formulaSteps), calculatorJson, verificationJson, JSON.stringify(q.tags ?? []), q.role, hash,
      ],
    );
    summary.questions.inserted++;
    return;
  }
  const changed = existing.content_hash !== hash;
  const backToReview = changed && existing.status === "approved";
  await db.run(
    `UPDATE questions SET lesson_id=?, position=?, difficulty=?, stem_md=?, options_json=?, correct_key=?, short_explanation_md=?,
       solution_steps_json=?, calculator_json=?, verification_json=?, role=?, content_hash=?, status=?,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    [
      lessonId, position, q.difficulty, q.stem, JSON.stringify(q.options), q.correct, q.explanation, JSON.stringify(q.formulaSteps),
      calculatorJson, verificationJson, q.role, hash, backToReview ? "review" : existing.status, q.id,
    ],
  );
  if (changed) summary.questions.updated++;
  if (backToReview) summary.questions.sentBackToReview++;
}

/**
 * Lesson number, topics and chapter mapping. Checkpoint and player-chapter
 * timings are set by an editor after the video is produced, so the import only
 * fills them while they are still empty.
 */
async function upsertLessonStructure(db: SqlDb, course: SeedCourse, lesson: SeedLesson) {
  await db.run(
    `UPDATE lessons SET number = ?, topics_json = ?,
       checkpoints_json = CASE WHEN checkpoints_json = '[]' THEN ? ELSE checkpoints_json END,
       video_chapters_json = CASE WHEN video_chapters_json = '[]' THEN ? ELSE video_chapters_json END
     WHERE id = ?`,
    [lesson.number, JSON.stringify(lesson.topics), JSON.stringify(lesson.checkpoints ?? []), JSON.stringify(lesson.videoChapters ?? []), lesson.id],
  );
  const mapped = await db.get("SELECT 1 FROM lesson_chapters WHERE lesson_id = ? LIMIT 1", [lesson.id]);
  if (mapped) return;
  for (const number of lesson.chapters) {
    const chapter = course.chapters.find((c) => c.number === number);
    if (chapter) await db.run("INSERT OR IGNORE INTO lesson_chapters (lesson_id, chapter_id) VALUES (?,?)", [lesson.id, chapter.id]);
  }
}

/**
 * One homework assignment per lesson, created as a draft. The imported
 * questions are added to its editable item list; publishing (which pins the
 * approved question versions) is a reviewer action.
 */
async function upsertAssignment(db: SqlDb, courseId: string, lesson: SeedLesson) {
  const id = `asg_${lesson.id}`;
  await db.run(
    `INSERT INTO assignments (id, course_id, lesson_id, number, title, question_count) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET number = excluded.number, title = excluded.title`,
    [id, courseId, lesson.id, lesson.number, `מטלה ${lesson.number}`, lesson.assignmentSize ?? 20],
  );
  for (const [index, question] of lesson.questions.entries()) {
    await db.run(
      `INSERT INTO assignment_items (assignment_id, question_id, position) VALUES (?,?,?)
       ON CONFLICT(assignment_id, question_id) DO UPDATE SET position = excluded.position`,
      [id, question.id, index + 1],
    );
  }
}
