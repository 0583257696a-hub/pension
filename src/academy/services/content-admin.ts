import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { newId } from "../lib/ids";
import { parseJson } from "../lib/json";
import { verifyQuestion, type VerificationReport } from "../content/verify";
import { calculatorVerdict, getFactStatuses } from "./facts";
import { snapshotQuestion } from "./question-versions";
import type { LessonRow, QuestionRow, StoredCalculator, UnitRow } from "./types";

export class ReviewGateError extends Error {}

/**
 * Professional review workflow. Nothing generated (by Claude or imported) is
 * shown to students until a reviewer approves it here, and a question can be
 * approved only when its automatic verification passed.
 */
export class ContentAdminService {
  constructor(private readonly db: SqlDb) {}

  async overview(courseId: string) {
    const units = await this.db.all<UnitRow>("SELECT * FROM units WHERE course_id = ? ORDER BY position", [courseId]);
    const lessons = await this.db.all<LessonRow & { q_total: number; q_approved: number; q_review: number; q_failed: number }>(
      `SELECT l.*,
         (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id) AS q_total,
         (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id AND q.status = 'approved') AS q_approved,
         (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id AND q.status = 'review') AS q_review,
         (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id AND json_extract(q.verification_json, '$.status') = 'failed') AS q_failed
       FROM lessons l JOIN units u ON u.id = l.unit_id WHERE u.course_id = ? ORDER BY u.position, l.position`,
      [courseId],
    );
    return units.map((u) => ({ ...u, lessons: lessons.filter((l) => l.unit_id === u.id) }));
  }

  async lessonDetail(lessonId: string, model: string) {
    const lesson = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [lessonId]);
    if (!lesson) return null;
    const facts = await getFactStatuses(this.db, model);
    const questions = await this.db.all<QuestionRow>("SELECT * FROM questions WHERE lesson_id = ? ORDER BY position", [lessonId]);
    const reviews = await this.db.all<{ target_id: string; action: string; note: string | null; created_at: string; email: string | null }>(
      `SELECT r.target_id, r.action, r.note, r.created_at, u.email FROM content_reviews r LEFT JOIN users u ON u.id = r.reviewer_id
       WHERE r.target_id = ? OR r.target_id IN (SELECT id FROM questions WHERE lesson_id = ?) ORDER BY r.created_at DESC`,
      [lessonId, lessonId],
    );
    return {
      lesson,
      examples: parseJson<Array<{ title: string; problem_md: string; solution_md: string; calculator: StoredCalculator | null; verification: VerificationReport | null }>>(lesson.examples_json, []).map((e) => ({
        ...e,
        calculatorVerdict: e.calculator ? calculatorVerdict(e.calculator.sequence, facts) : null,
      })),
      questions: questions.map((q) => {
        const calc = parseJson<StoredCalculator | null>(q.calculator_json, null);
        return {
          ...q,
          options: parseJson<Array<{ key: string; text: string; value?: number }>>(q.options_json, []),
          steps: parseJson<Array<{ title: string; body: string }>>(q.solution_steps_json, []),
          calculator: calc,
          calculatorVerdict: calc ? calculatorVerdict(calc.sequence, facts) : null,
          verification: parseJson<VerificationReport & { check?: { expression: string; tolerance: number } | null }>(q.verification_json, { status: "failed", engineValue: null, checks: [], checkedAt: "" }),
        };
      }),
      reviews,
    };
  }

  /** Re-runs automatic verification for one question (e.g. after editing). */
  async reverifyQuestion(questionId: string, model: string): Promise<VerificationReport> {
    const q = await this.db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [questionId]);
    if (!q) throw new ReviewGateError("שאלה לא נמצאה");
    const stored = parseJson<{ check?: { expression: string; tolerance: number } | null }>(q.verification_json, {});
    const calc = parseJson<(StoredCalculator & { expectedDisplay?: string }) | null>(q.calculator_json, null);
    const report = verifyQuestion(
      {
        options: parseJson(q.options_json, []),
        correct: q.correct_key,
        check: stored.check ?? undefined,
        calculator: calc
          ? { plan: calc.plan, expectedDisplay: calc.sequence.result.display, compare: calc.compare, resultMeaning: calc.sequence.result.meaning, interpretation: calc.interpretation, solution: calc }
          : null,
      },
      model,
    );
    await this.db.run("UPDATE questions SET verification_json = ? WHERE id = ?", [JSON.stringify({ ...report, check: stored.check ?? null }), questionId]);
    return report;
  }

  async reviewQuestion(reviewer: User, questionId: string, action: "approve" | "reject" | "request_changes", note: string) {
    const q = await this.db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [questionId]);
    if (!q) throw new ReviewGateError("שאלה לא נמצאה");
    if (action === "approve") {
      const verification = parseJson<VerificationReport>(q.verification_json, { status: "failed", engineValue: null, checks: [], checkedAt: "" });
      if (verification.status === "failed") throw new ReviewGateError("לא ניתן לאשר שאלה שנכשלה בבדיקה האוטומטית. יש לתקן ולהריץ בדיקה מחדש.");
    }
    if (action !== "approve" && !note.trim()) throw new ReviewGateError("יש לפרט את סיבת הדחייה או את התיקונים הנדרשים");
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "review";
    await this.db.run("UPDATE questions SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [status, questionId]);
    // Approval freezes the content as a question version; published assignments pin these versions.
    const version = action === "approve" ? await snapshotQuestion(this.db, questionId, reviewer.id) : null;
    await this.logReview(reviewer, "question", questionId, action, version ? `${note ? `${note} · ` : ""}גרסה ${version}` : note);
  }

  async setLessonStatus(reviewer: User, lessonId: string, action: "publish" | "unpublish") {
    const lesson = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [lessonId]);
    if (!lesson) throw new ReviewGateError("שיעור לא נמצא");
    if (action === "publish") {
      if (lesson.status === "draft" && !lesson.summary_md.trim()) throw new ReviewGateError("לא ניתן לפרסם שיעור ללא תוכן");
      const approved = await this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM questions WHERE lesson_id = ? AND status = 'approved'", [lessonId]);
      if (!Number(approved?.n)) throw new ReviewGateError("יש לאשר לפחות שאלה אחת לפני פרסום השיעור");
      const unit = await this.db.get<UnitRow>("SELECT * FROM units WHERE id = ?", [lesson.unit_id]);
      if (unit && unit.status !== "published") await this.db.run("UPDATE units SET status = 'published' WHERE id = ?", [unit.id]);
    }
    await this.db.run("UPDATE lessons SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [action === "publish" ? "published" : "review", lessonId]);
    await this.logReview(reviewer, "lesson", lessonId, action, "");
  }

  async setLessonAccess(reviewer: User, lessonId: string, access: "free" | "paid") {
    await this.db.run("UPDATE lessons SET access = ? WHERE id = ?", [access, lessonId]);
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), reviewer.id, "lesson.access", "lesson", lessonId, JSON.stringify({ access }),
    ]);
  }

  async moveLesson(actor: User, lessonId: string, unitId: string, position: number) {
    // Progress rows reference the lesson id, so moving never touches student records.
    await this.db.run("UPDATE lessons SET unit_id = ?, position = ? WHERE id = ?", [unitId, position, lessonId]);
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), actor.id, "lesson.move", "lesson", lessonId, JSON.stringify({ unitId, position }),
    ]);
  }

  async reviewQueue() {
    return this.db.all<{ id: string; stem_md: string; lesson_title: string; lesson_id: string; source: string; status: string; verification_status: string }>(
      `SELECT q.id, q.stem_md, l.title AS lesson_title, l.id AS lesson_id, q.source, q.status,
              json_extract(q.verification_json, '$.status') AS verification_status
       FROM questions q JOIN lessons l ON l.id = q.lesson_id WHERE q.status = 'review' ORDER BY l.position, q.position`,
    );
  }

  private async logReview(reviewer: User, targetType: string, targetId: string, action: string, note: string) {
    await this.db.run("INSERT INTO content_reviews (id, target_type, target_id, action, note, reviewer_id) VALUES (?,?,?,?,?,?)", [
      newId("rev"), targetType, targetId, action, note || null, reviewer.id,
    ]);
  }
}
