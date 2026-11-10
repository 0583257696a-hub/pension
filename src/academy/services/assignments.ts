import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { isStaff } from "../auth/service";
import { decideLessonAccess, EntitlementService } from "../billing/entitlements";
import { getCalculator } from "../calculator";
import { newId, nowIso } from "../lib/ids";
import { parseJson } from "../lib/json";
import { calculatorVerdict, getFactStatuses } from "./facts";
import { AccessDeniedError } from "./learning";
import { hasUnversionedChanges, loadSnapshots, snapshotQuestion, type QuestionSnapshot } from "./question-versions";
import type { LessonRow, SolutionPresentation, UnitRow } from "./types";

export class AssignmentError extends Error {}

export type SolutionPolicy = "anytime" | "after_answer" | "after_submit";

export interface AssignmentRow {
  id: string; course_id: string; lesson_id: string; number: number; title: string; question_count: number;
  solution_policy: SolutionPolicy; allow_retake: number; status: "draft" | "published" | "archived"; version: number;
  published_at: string | null; updated_at: string;
}

export interface VersionItem { questionId: string; questionVersion: number; points: number }

interface AttemptRow {
  id: string; user_id: string; assignment_id: string; assignment_version: number; attempt_no: number;
  kind: "official" | "practice"; status: "in_progress" | "submitted"; current_position: number;
  score: number | null; correct_count: number | null; total_count: number | null; earned_points: number | null; total_points: number | null;
  started_at: string; updated_at: string; submitted_at: string | null;
}

interface AnswerRow {
  attempt_id: string; question_id: string; question_version: number; position: number; chosen_key: string | null;
  answered_at: string | null; solution_viewed_at: string | null; viewed_before_answer: number; is_correct: number | null; points_awarded: number | null;
}

/** Grade on a 0–100 scale, one decimal. 16 of 20 equally weighted questions = 80. */
export function gradeOf(earned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((earned / total) * 1000) / 10;
}

/**
 * Fixed homework assignments (spec §11–§12, §24).
 *
 * Every student of a published assignment version sees the same questions, in
 * the same order, read from frozen question versions. Answers are saved one by
 * one as they are chosen. The first submitted attempt is the official grade;
 * later attempts are practice and never overwrite it. Opening a solution before
 * submitting locks that question's answer and is recorded.
 */
export class AssignmentService {
  private readonly entitlements: EntitlementService;
  constructor(private readonly db: SqlDb) {
    this.entitlements = new EntitlementService(db);
  }

  // ---------------------------------------------------------------- access

  private async lessonContext(lessonId: string) {
    const lesson = await this.db.get<LessonRow & { number: number | null }>("SELECT * FROM lessons WHERE id = ?", [lessonId]);
    if (!lesson) throw new AccessDeniedError("not_found");
    const unit = await this.db.get<UnitRow>("SELECT * FROM units WHERE id = ?", [lesson.unit_id]);
    return { lesson, unit: unit! };
  }

  private async assertAccess(user: User, assignment: AssignmentRow) {
    if (isStaff(user)) return;
    if (assignment.status !== "published") throw new AccessDeniedError("not_published");
    const { lesson, unit } = await this.lessonContext(assignment.lesson_id);
    const entitlement = await this.entitlements.getEntitlement(user, unit.course_id);
    const decision = decideLessonAccess(user, lesson, entitlement);
    if (!decision.allowed) throw new AccessDeniedError(decision.reason);
  }

  async get(id: string): Promise<AssignmentRow | null> {
    return this.db.get<AssignmentRow>("SELECT * FROM assignments WHERE id = ?", [id]);
  }

  async forLesson(lessonId: string): Promise<AssignmentRow | null> {
    return this.db.get<AssignmentRow>("SELECT * FROM assignments WHERE lesson_id = ?", [lessonId]);
  }

  private async versionItems(assignmentId: string, version: number): Promise<{ items: VersionItem[]; totalPoints: number }> {
    const row = await this.db.get<{ items_json: string; total_points: number }>(
      "SELECT items_json, total_points FROM assignment_versions WHERE assignment_id = ? AND version = ?",
      [assignmentId, version],
    );
    if (!row) throw new AssignmentError("גרסת המטלה לא נמצאה");
    return { items: JSON.parse(row.items_json), totalPoints: Number(row.total_points) };
  }

  // ---------------------------------------------------------------- student

  /** "מטלות": every published assignment of the course, with the student's official grade and lock state. */
  async listForStudent(user: User, courseId: string) {
    const rows = await this.db.all<AssignmentRow & { lesson_slug: string; lesson_title: string; lesson_status: string; lesson_access: "free" | "paid" }>(
      `SELECT a.*, l.slug AS lesson_slug, l.title AS lesson_title, l.status AS lesson_status, l.access AS lesson_access
       FROM assignments a JOIN lessons l ON l.id = a.lesson_id
       WHERE a.course_id = ? AND (a.status = 'published' OR ?) ORDER BY a.number`,
      [courseId, isStaff(user) ? 1 : 0],
    );
    const entitlement = await this.entitlements.getEntitlement(user, courseId);
    const out = [];
    for (const a of rows) {
      if (a.version === 0) continue;
      const access = decideLessonAccess(user, { access: a.lesson_access, status: a.lesson_status as "published" }, entitlement);
      const official = await this.db.get<AttemptRow>(
        "SELECT * FROM assignment_attempts WHERE user_id = ? AND assignment_id = ? AND kind = 'official' AND status = 'submitted'",
        [user.id, a.id],
      );
      const open = await this.db.get<AttemptRow>(
        "SELECT * FROM assignment_attempts WHERE user_id = ? AND assignment_id = ? AND status = 'in_progress' ORDER BY attempt_no DESC LIMIT 1",
        [user.id, a.id],
      );
      const answered = open
        ? Number((await this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM attempt_answers WHERE attempt_id = ? AND chosen_key IS NOT NULL", [open.id]))?.n ?? 0)
        : 0;
      const { items } = await this.versionItems(a.id, a.version);
      out.push({
        id: a.id, number: a.number, title: a.title, lessonSlug: a.lesson_slug, lessonTitle: a.lesson_title,
        questionCount: items.length, allowed: access.allowed, lockReason: access.allowed ? null : access.reason,
        official: official ? { score: official.score, correct: official.correct_count, total: official.total_count, submittedAt: official.submitted_at, attemptId: official.id } : null,
        inProgress: open ? { attemptId: open.id, answered, kind: open.kind } : null,
      });
    }
    return out;
  }

  /** Opens the student's current attempt, creating it (pinned to the latest published version) when needed. */
  async startOrResume(user: User, assignmentId: string, opts: { newAttempt?: boolean } = {}) {
    const assignment = await this.get(assignmentId);
    if (!assignment) throw new AccessDeniedError("not_found");
    await this.assertAccess(user, assignment);
    if (assignment.version === 0) throw new AssignmentError("המטלה עדיין לא פורסמה");
    const open = await this.db.get<AttemptRow>(
      "SELECT * FROM assignment_attempts WHERE user_id = ? AND assignment_id = ? AND status = 'in_progress' ORDER BY attempt_no DESC LIMIT 1",
      [user.id, assignmentId],
    );
    if (open) return open.id;
    const last = await this.db.get<{ n: number }>("SELECT MAX(attempt_no) AS n FROM assignment_attempts WHERE user_id = ? AND assignment_id = ?", [user.id, assignmentId]);
    const attemptNo = Number(last?.n ?? 0) + 1;
    if (attemptNo > 1) {
      if (!opts.newAttempt) {
        const lastAttempt = await this.db.get<{ id: string }>(
          "SELECT id FROM assignment_attempts WHERE user_id = ? AND assignment_id = ? ORDER BY attempt_no DESC LIMIT 1",
          [user.id, assignmentId],
        );
        return lastAttempt!.id;
      }
      if (!assignment.allow_retake) throw new AssignmentError("במטלה זו אפשר להגיש פעם אחת בלבד");
    }
    const { items, totalPoints } = await this.versionItems(assignmentId, assignment.version);
    const id = newId("att");
    await this.db.batch([
      {
        sql: `INSERT INTO assignment_attempts (id, user_id, assignment_id, assignment_version, attempt_no, kind, total_count, total_points)
              VALUES (?,?,?,?,?,?,?,?)`,
        params: [id, user.id, assignmentId, assignment.version, attemptNo, attemptNo === 1 ? "official" : "practice", items.length, totalPoints],
      },
      ...items.map((item, index) => ({
        sql: "INSERT INTO attempt_answers (attempt_id, question_id, question_version, position) VALUES (?,?,?,?)",
        params: [id, item.questionId, item.questionVersion, index + 1],
      })),
    ]);
    return id;
  }

  private async loadAttempt(user: User, attemptId: string) {
    const attempt = await this.db.get<AttemptRow>("SELECT * FROM assignment_attempts WHERE id = ?", [attemptId]);
    if (!attempt || (attempt.user_id !== user.id && !isStaff(user))) throw new AccessDeniedError("not_found");
    const assignment = (await this.get(attempt.assignment_id))!;
    if (attempt.user_id === user.id) await this.assertAccess(user, assignment);
    const answers = await this.db.all<AnswerRow>("SELECT * FROM attempt_answers WHERE attempt_id = ? ORDER BY position", [attemptId]);
    const snapshots = await loadSnapshots(this.db, answers.map((a) => ({ questionId: a.question_id, questionVersion: a.question_version })));
    return { attempt, assignment, answers, snapshots };
  }

  /** Everything the question screen needs. Correct keys appear only for opened solutions or after submission. */
  async attemptView(user: User, attemptId: string) {
    const { attempt, assignment, answers, snapshots } = await this.loadAttempt(user, attemptId);
    const { lesson } = await this.lessonContext(assignment.lesson_id);
    const submitted = attempt.status === "submitted";
    return {
      attempt: {
        id: attempt.id, status: attempt.status, kind: attempt.kind, attemptNo: attempt.attempt_no, currentPosition: attempt.current_position,
        score: attempt.score, correct: attempt.correct_count, total: attempt.total_count, submittedAt: attempt.submitted_at,
      },
      assignment: {
        id: assignment.id, number: assignment.number, title: assignment.title, solutionPolicy: assignment.solution_policy,
        allowRetake: !!assignment.allow_retake, version: attempt.assignment_version,
      },
      lesson: { id: lesson.id, slug: lesson.slug, title: lesson.title, number: lesson.number },
      questions: answers.map((a) => {
        const snap = snapshots.get(`${a.question_id}@${a.question_version}`)!;
        const revealed = submitted || !!a.solution_viewed_at;
        return {
          id: a.question_id,
          version: a.question_version,
          position: a.position,
          stem: snap.stem,
          options: snap.options.map(({ key, text }) => ({ key, text })),
          chosenKey: a.chosen_key,
          locked: submitted || !!a.solution_viewed_at,
          solutionViewed: !!a.solution_viewed_at,
          viewedBeforeAnswer: !!a.viewed_before_answer,
          correctKey: revealed ? snap.correctKey : null,
          isCorrect: submitted ? !!a.is_correct : null,
        };
      }),
    };
  }

  async saveAnswer(user: User, attemptId: string, questionId: string, chosenKey: string | null, position?: number) {
    const { attempt, answers, snapshots } = await this.loadAttempt(user, attemptId);
    if (attempt.user_id !== user.id) throw new AccessDeniedError("not_found");
    if (attempt.status !== "in_progress") throw new AssignmentError("המטלה כבר הוגשה");
    const answer = answers.find((a) => a.question_id === questionId);
    if (!answer) throw new AssignmentError("השאלה אינה חלק מהמטלה");
    if (answer.solution_viewed_at) throw new AssignmentError("לאחר צפייה בפתרון אי אפשר לשנות את התשובה לשאלה זו");
    const snap = snapshots.get(`${answer.question_id}@${answer.question_version}`)!;
    if (chosenKey !== null && !snap.options.some((o) => o.key === chosenKey)) throw new AssignmentError("תשובה לא תקינה");
    const now = nowIso();
    await this.db.batch([
      {
        sql: "UPDATE attempt_answers SET chosen_key = ?, answered_at = ? WHERE attempt_id = ? AND question_id = ?",
        params: [chosenKey, chosenKey ? now : null, attemptId, questionId],
      },
      {
        sql: "UPDATE assignment_attempts SET current_position = ?, updated_at = ? WHERE id = ?",
        params: [position ?? answer.position, now, attemptId],
      },
    ]);
    return { saved: true, savedAt: now };
  }

  async setPosition(user: User, attemptId: string, position: number) {
    const attempt = await this.db.get<AttemptRow>("SELECT * FROM assignment_attempts WHERE id = ?", [attemptId]);
    if (!attempt || attempt.user_id !== user.id) throw new AccessDeniedError("not_found");
    if (attempt.status !== "in_progress") return;
    const safe = Math.max(1, Math.min(Math.round(position), Number(attempt.total_count ?? 1)));
    await this.db.run("UPDATE assignment_attempts SET current_position = ?, updated_at = ? WHERE id = ?", [safe, nowIso(), attemptId]);
  }

  /** The approved solution of one question, as frozen in the pinned version. */
  async viewSolution(user: User, attemptId: string, questionId: string): Promise<SolutionPresentation & { lockedAnswer: boolean }> {
    const { attempt, assignment, answers, snapshots } = await this.loadAttempt(user, attemptId);
    const answer = answers.find((a) => a.question_id === questionId);
    if (!answer) throw new AssignmentError("השאלה אינה חלק מהמטלה");
    const submitted = attempt.status === "submitted";
    const policy = assignment.solution_policy;
    if (!submitted && !isStaff(user)) {
      if (policy === "after_submit") throw new AssignmentError("הפתרונות יוצגו אחרי הגשת המטלה");
      if (policy === "after_answer" && !answer.chosen_key) throw new AssignmentError("בחרו תשובה לפני הצפייה בפתרון");
    }
    if (!submitted && attempt.user_id === user.id && !answer.solution_viewed_at) {
      await this.db.run(
        "UPDATE attempt_answers SET solution_viewed_at = ?, viewed_before_answer = ? WHERE attempt_id = ? AND question_id = ?",
        [nowIso(), answer.chosen_key ? 0 : 1, attemptId, questionId],
      );
    }
    const snap = snapshots.get(`${answer.question_id}@${answer.question_version}`)!;
    return { ...(await this.presentSolution(snap, assignment.course_id)), lockedAnswer: !submitted };
  }

  async presentSolution(snap: QuestionSnapshot, courseId: string): Promise<SolutionPresentation> {
    const course = await this.db.get<{ calculator_model: string }>("SELECT calculator_model FROM courses WHERE id = ?", [courseId]);
    const model = course?.calculator_model ?? "casio-fc-200v";
    const facts = await getFactStatuses(this.db, model);
    let calculator: SolutionPresentation["calculator"] = null;
    let reason: string | null = null;
    if (!snap.calculator) reason = "אין פתרון במחשבון לשאלה זו";
    else if (snap.verification.status !== "verified") reason = "הפתרון לא עבר בדיקה מתמטית";
    else {
      const verdict = calculatorVerdict(snap.calculator.sequence, facts);
      if (verdict.verified) calculator = { ...snap.calculator, modelName: getCalculator(model).model.name };
      else if (!verdict.simulation.ok) reason = `הסימולטור דחה את הרצף: ${verdict.simulation.errors.join(" | ")}`;
      else reason = `ממתין לאישור עובדות המחשבון: ${[...verdict.pendingFacts, ...verdict.rejectedFacts].join(", ")}`;
    }
    // Solution videos are presentation, not grading: the latest published video of the question is shown.
    const video = await this.db.get<{ id: string; title: string }>(
      "SELECT id, title FROM video_assets WHERE target_type = 'question' AND target_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1",
      [snap.id],
    );
    return {
      questionId: snap.id,
      correctKey: snap.correctKey,
      explanation: snap.explanation,
      calculator,
      calculatorUnavailableReason: reason,
      formulaSteps: snap.steps.map((s) => ({ title: s.title, body_md: s.body })),
      isCalculation: !!snap.calculator || !!snap.verification.engineValue,
      video: video ? { id: video.id, title: video.title, url: `/api/academy/media/${video.id}` } : null,
      verification: snap.verification,
    };
  }

  async submit(user: User, attemptId: string) {
    const { attempt, answers, snapshots } = await this.loadAttempt(user, attemptId);
    if (attempt.user_id !== user.id) throw new AccessDeniedError("not_found");
    if (attempt.status === "submitted") return this.results(user, attemptId);
    const { items, totalPoints } = await this.versionItems(attempt.assignment_id, attempt.assignment_version);
    const pointsOf = new Map(items.map((i) => [i.questionId, i.points]));
    let earned = 0;
    let correct = 0;
    const updates = answers.map((a) => {
      const snap = snapshots.get(`${a.question_id}@${a.question_version}`)!;
      const ok = a.chosen_key !== null && a.chosen_key === snap.correctKey;
      const points = ok ? pointsOf.get(a.question_id) ?? 0 : 0;
      if (ok) correct++;
      earned += points;
      return {
        sql: "UPDATE attempt_answers SET is_correct = ?, points_awarded = ? WHERE attempt_id = ? AND question_id = ?",
        params: [ok ? 1 : 0, points, attemptId, a.question_id],
      };
    });
    const score = gradeOf(earned, totalPoints);
    const now = nowIso();
    const assignment = (await this.get(attempt.assignment_id))!;
    await this.db.batch([
      ...updates,
      {
        sql: `UPDATE assignment_attempts SET status = 'submitted', score = ?, correct_count = ?, earned_points = ?, submitted_at = ?, updated_at = ?
              WHERE id = ? AND status = 'in_progress'`,
        params: [score, correct, earned, now, now, attemptId],
      },
      { sql: "INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?,?)", params: [user.id, assignment.lesson_id] },
      {
        sql: "UPDATE lesson_progress SET quiz_passed = 1, completed = 1, last_seen_at = ? WHERE user_id = ? AND lesson_id = ?",
        params: [now, user.id, assignment.lesson_id],
      },
    ]);
    return this.results(user, attemptId);
  }

  async results(user: User, attemptId: string) {
    const view = await this.attemptView(user, attemptId);
    if (view.attempt.status !== "submitted") throw new AssignmentError("המטלה עוד לא הוגשה");
    const official = await this.db.get<AttemptRow>(
      "SELECT * FROM assignment_attempts WHERE user_id = (SELECT user_id FROM assignment_attempts WHERE id = ?) AND assignment_id = ? AND kind = 'official' AND status = 'submitted'",
      [attemptId, view.assignment.id],
    );
    return {
      ...view,
      summary: {
        score: view.attempt.score ?? 0,
        correct: view.attempt.correct ?? 0,
        total: view.attempt.total ?? view.questions.length,
        wrong: view.questions.filter((q) => !q.isCorrect).map((q) => q.position),
        viewedBeforeAnswer: view.questions.filter((q) => q.viewedBeforeAnswer).map((q) => q.position),
        official: official ? { score: official.score, attemptId: official.id } : null,
      },
    };
  }

  /** "היסטוריית ציונים": every submitted attempt. */
  async gradeHistory(user: User) {
    return this.db.all<{ attempt_id: string; assignment_id: string; number: number; title: string; kind: string; attempt_no: number; score: number; correct_count: number; total_count: number; submitted_at: string }>(
      `SELECT t.id AS attempt_id, a.id AS assignment_id, a.number, a.title, t.kind, t.attempt_no, t.score, t.correct_count, t.total_count, t.submitted_at
       FROM assignment_attempts t JOIN assignments a ON a.id = t.assignment_id
       WHERE t.user_id = ? AND t.status = 'submitted' ORDER BY a.number, t.attempt_no`,
      [user.id],
    );
  }

  // ---------------------------------------------------------------- admin

  async adminList(courseId: string) {
    return this.db.all<AssignmentRow & { lesson_title: string; lesson_status: string; items: number; approved: number; attempts: number; avg_score: number | null }>(
      `SELECT a.*, l.title AS lesson_title, l.status AS lesson_status,
         (SELECT COUNT(*) FROM assignment_items i WHERE i.assignment_id = a.id) AS items,
         (SELECT COUNT(*) FROM assignment_items i JOIN questions q ON q.id = i.question_id WHERE i.assignment_id = a.id AND q.status = 'approved') AS approved,
         (SELECT COUNT(*) FROM assignment_attempts t WHERE t.assignment_id = a.id AND t.kind = 'official' AND t.status = 'submitted') AS attempts,
         (SELECT AVG(t.score) FROM assignment_attempts t WHERE t.assignment_id = a.id AND t.kind = 'official' AND t.status = 'submitted') AS avg_score
       FROM assignments a JOIN lessons l ON l.id = a.lesson_id WHERE a.course_id = ? ORDER BY a.number`,
      [courseId],
    );
  }

  async adminDetail(assignmentId: string) {
    const assignment = await this.get(assignmentId);
    if (!assignment) return null;
    const items = await this.db.all<{ question_id: string; position: number; points: number | null; stem_md: string; status: string; version: number; verification_status: string; video_id: string | null }>(
      `SELECT i.question_id, i.position, i.points, q.stem_md, q.status, q.version,
         json_extract(q.verification_json, '$.status') AS verification_status,
         (SELECT v.id FROM video_assets v WHERE v.target_type = 'question' AND v.target_id = q.id AND v.status = 'published' LIMIT 1) AS video_id
       FROM assignment_items i JOIN questions q ON q.id = i.question_id WHERE i.assignment_id = ? ORDER BY i.position`,
      [assignmentId],
    );
    const pinned = assignment.version ? (await this.versionItems(assignmentId, assignment.version)).items : [];
    const pinnedBy = new Map(pinned.map((p) => [p.questionId, p.questionVersion]));
    const withChanges = [];
    for (const item of items) {
      withChanges.push({
        ...item,
        pinnedVersion: pinnedBy.get(item.question_id) ?? null,
        changedSinceApproval: await hasUnversionedChanges(this.db, item.question_id),
      });
    }
    const versions = await this.db.all<{ version: number; published_at: string; total_points: number; email: string | null }>(
      `SELECT v.version, v.published_at, v.total_points, u.email FROM assignment_versions v LEFT JOIN users u ON u.id = v.published_by
       WHERE v.assignment_id = ? ORDER BY v.version DESC`,
      [assignmentId],
    );
    return { assignment, items: withChanges, checks: this.publishChecks(assignment, withChanges), versions };
  }

  /** Pre-publication checks (spec §34). Every check must pass. */
  publishChecks(
    assignment: AssignmentRow,
    items: Array<{ status: string; verification_status: string; video_id: string | null; changedSinceApproval: boolean }>,
  ) {
    const approved = items.filter((i) => i.status === "approved");
    const verified = items.filter((i) => i.verification_status === "verified" || i.verification_status === "not_applicable");
    const videos = items.filter((i) => i.video_id).length;
    return [
      { label: `במטלה ${assignment.question_count} שאלות בדיוק`, ok: items.length === assignment.question_count, detail: `${items.length} שאלות ברשימה` },
      { label: "כל השאלות אושרו על ידי בודק", ok: approved.length === items.length && items.length > 0, detail: `${approved.length}/${items.length} מאושרות` },
      { label: "כל השאלות עברו בדיקה מתמטית אוטומטית", ok: verified.length === items.length && items.length > 0, detail: `${verified.length}/${items.length} עברו` },
      { label: "אין שינויים שלא אושרו מאז האישור האחרון", ok: !items.some((i) => i.changedSinceApproval), detail: `${items.filter((i) => i.changedSinceApproval).length} שאלות שונו` },
      // Shown, not blocking: students see "סרטון הפתרון בהכנה" where a video is missing.
      { label: "סרטוני פתרון (מידע)", ok: true, detail: `${videos}/${items.length} שאלות עם סרטון מפורסם` },
    ];
  }

  async publish(admin: User, assignmentId: string) {
    const detail = await this.adminDetail(assignmentId);
    if (!detail) throw new AssignmentError("מטלה לא נמצאה");
    const failed = detail.checks.filter((c) => !c.ok);
    if (failed.length) throw new AssignmentError(`לא ניתן לפרסם: ${failed.map((c) => c.label).join(" · ")}`);
    const items: VersionItem[] = [];
    const equal = 100 / detail.items.length;
    for (const item of detail.items) {
      const version = await snapshotQuestion(this.db, item.question_id, admin.id);
      items.push({ questionId: item.question_id, questionVersion: version, points: item.points ?? equal });
    }
    const totalPoints = Math.round(items.reduce((sum, i) => sum + i.points, 0) * 1e6) / 1e6;
    if (detail.assignment.version) {
      const current = await this.versionItems(assignmentId, detail.assignment.version);
      if (JSON.stringify(current.items) === JSON.stringify(items)) {
        if (detail.assignment.status !== "published") {
          await this.db.run("UPDATE assignments SET status = 'published', updated_at = ? WHERE id = ?", [nowIso(), assignmentId]);
        }
        return { version: detail.assignment.version, unchanged: true };
      }
    }
    const version = detail.assignment.version + 1;
    const now = nowIso();
    await this.db.batch([
      {
        sql: "INSERT INTO assignment_versions (assignment_id, version, items_json, total_points, published_by) VALUES (?,?,?,?,?)",
        params: [assignmentId, version, JSON.stringify(items), totalPoints, admin.id],
      },
      { sql: "UPDATE assignments SET version = ?, status = 'published', published_at = ?, updated_at = ? WHERE id = ?", params: [version, now, now, assignmentId] },
      {
        sql: "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)",
        params: [newId("aud"), admin.id, "assignment.publish", "assignment", assignmentId, JSON.stringify({ version, items: items.length })],
      },
    ]);
    return { version, unchanged: false };
  }

  async unpublish(admin: User, assignmentId: string) {
    await this.db.run("UPDATE assignments SET status = 'draft', updated_at = ? WHERE id = ?", [nowIso(), assignmentId]);
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), admin.id, "assignment.unpublish", "assignment", assignmentId, "{}",
    ]);
  }

  async updateSettings(admin: User, assignmentId: string, settings: { questionCount?: number; solutionPolicy?: SolutionPolicy; allowRetake?: boolean; title?: string }) {
    const a = await this.get(assignmentId);
    if (!a) throw new AssignmentError("מטלה לא נמצאה");
    const count = settings.questionCount ?? a.question_count;
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new AssignmentError("מספר שאלות לא תקין");
    const policy = settings.solutionPolicy ?? a.solution_policy;
    if (!["anytime", "after_answer", "after_submit"].includes(policy)) throw new AssignmentError("מדיניות פתרונות לא תקינה");
    await this.db.run(
      "UPDATE assignments SET question_count = ?, solution_policy = ?, allow_retake = ?, title = ?, updated_at = ? WHERE id = ?",
      [count, policy, settings.allowRetake === undefined ? a.allow_retake : settings.allowRetake ? 1 : 0, settings.title?.trim() || a.title, nowIso(), assignmentId],
    );
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), admin.id, "assignment.settings", "assignment", assignmentId, JSON.stringify(settings),
    ]);
  }

  /** Points override for one question in the next version (null = equal weighting). */
  async setItemPoints(admin: User, assignmentId: string, questionId: string, points: number | null) {
    if (points !== null && (!Number.isFinite(points) || points < 0 || points > 100)) throw new AssignmentError("ניקוד לא תקין");
    await this.db.run("UPDATE assignment_items SET points = ? WHERE assignment_id = ? AND question_id = ?", [points, assignmentId, questionId]);
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), admin.id, "assignment.points", "assignment", assignmentId, JSON.stringify({ questionId, points }),
    ]);
  }

  async removeItem(admin: User, assignmentId: string, questionId: string) {
    await this.db.run("DELETE FROM assignment_items WHERE assignment_id = ? AND question_id = ?", [assignmentId, questionId]);
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), admin.id, "assignment.remove_item", "assignment", assignmentId, JSON.stringify({ questionId }),
    ]);
  }

  async addItem(admin: User, assignmentId: string, questionId: string) {
    const a = await this.get(assignmentId);
    const q = await this.db.get<{ lesson_id: string }>("SELECT lesson_id FROM questions WHERE id = ?", [questionId]);
    if (!a || !q) throw new AssignmentError("לא נמצא");
    if (q.lesson_id !== a.lesson_id) throw new AssignmentError("אפשר לצרף רק שאלות של אותו שיעור");
    const max = await this.db.get<{ n: number }>("SELECT MAX(position) AS n FROM assignment_items WHERE assignment_id = ?", [assignmentId]);
    await this.db.run("INSERT OR IGNORE INTO assignment_items (assignment_id, question_id, position) VALUES (?,?,?)", [assignmentId, questionId, Number(max?.n ?? 0) + 1]);
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), admin.id, "assignment.add_item", "assignment", assignmentId, JSON.stringify({ questionId }),
    ]);
  }

  /** Grade report for the admin: one row per student with the official grade. */
  async gradeReport(assignmentId: string) {
    return this.db.all<{ user_id: string; email: string; full_name: string; score: number; correct_count: number; total_count: number; submitted_at: string; practice_attempts: number }>(
      `SELECT u.id AS user_id, u.email, u.full_name, t.score, t.correct_count, t.total_count, t.submitted_at,
         (SELECT COUNT(*) FROM assignment_attempts p WHERE p.user_id = u.id AND p.assignment_id = t.assignment_id AND p.kind = 'practice') AS practice_attempts
       FROM assignment_attempts t JOIN users u ON u.id = t.user_id
       WHERE t.assignment_id = ? AND t.kind = 'official' AND t.status = 'submitted' ORDER BY t.submitted_at DESC`,
      [assignmentId],
    );
  }
}

export function parseVersionItems(json: string): VersionItem[] {
  return parseJson<VersionItem[]>(json, []);
}
