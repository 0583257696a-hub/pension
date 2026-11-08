import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { isStaff } from "../auth/service";
import { decideLessonAccess, EntitlementService, type Entitlement } from "../billing/entitlements";
import { getCalculator } from "../calculator";
import { newId, nowIso } from "../lib/ids";
import { parseJson } from "../lib/json";
import { calculatorVerdict, getFactStatuses } from "./facts";
import type {
  CourseRow, LessonRow, QuestionRow, QuizRow, SolutionPresentation, StoredCalculator, StudentQuestion, UnitRow,
} from "./types";

export class AccessDeniedError extends Error {
  constructor(readonly reason: string) {
    super(reason === "login_required" ? "נדרשת התחברות" : reason === "subscription_required" ? "התוכן זמין למנויים" : "התוכן אינו זמין");
  }
}

export interface LessonProgress {
  video_seconds: number;
  video_completed: number;
  practice_done: number;
  quiz_passed: number;
  completed: number;
}

export interface ExampleView {
  title: string;
  problem_md: string;
  solution_md: string;
  calculator: (StoredCalculator & { modelName: string }) | null;
}

export class LearningService {
  private readonly entitlements: EntitlementService;
  constructor(private readonly db: SqlDb) {
    this.entitlements = new EntitlementService(db);
  }

  async getCourse(): Promise<CourseRow | null> {
    return this.db.get<CourseRow>("SELECT * FROM courses WHERE status = 'published' ORDER BY created_at LIMIT 1");
  }

  async getEntitlement(user: User | null, courseId: string): Promise<Entitlement> {
    return this.entitlements.getEntitlement(user, courseId);
  }

  async getSyllabus(user: User | null) {
    const course = await this.getCourse();
    if (!course) return null;
    const units = await this.db.all<UnitRow>("SELECT * FROM units WHERE course_id = ? ORDER BY position", [course.id]);
    const lessons = await this.db.all<LessonRow>(
      `SELECT l.* FROM lessons l JOIN units u ON u.id = l.unit_id WHERE u.course_id = ? ORDER BY u.position, l.position`,
      [course.id],
    );
    const progress = user
      ? await this.db.all<LessonProgress & { lesson_id: string }>("SELECT * FROM lesson_progress WHERE user_id = ?", [user.id])
      : [];
    const byLesson = new Map(progress.map((p) => [p.lesson_id, p]));
    const entitlement = await this.getEntitlement(user, course.id);
    const staff = isStaff(user);
    return {
      course,
      entitlement,
      units: units.map((unit) => ({
        ...unit,
        lessons: lessons
          .filter((l) => l.unit_id === unit.id)
          .map((l) => {
            const access = decideLessonAccess(user, l, entitlement);
            return {
              id: l.id,
              slug: l.slug,
              title: l.title,
              description: l.description,
              access: l.access,
              status: l.status,
              minutes: l.estimated_minutes,
              available: l.status === "published" || staff,
              allowed: access.allowed,
              lockReason: access.allowed ? null : access.reason,
              progress: byLesson.get(l.id) ?? null,
            };
          }),
      })),
    };
  }

  async getLessonBySlug(slug: string): Promise<LessonRow | null> {
    return this.db.get<LessonRow>("SELECT * FROM lessons WHERE slug = ?", [slug]);
  }

  private async lessonAccess(user: User | null, lesson: LessonRow) {
    const unit = await this.db.get<UnitRow>("SELECT * FROM units WHERE id = ?", [lesson.unit_id]);
    const entitlement = await this.getEntitlement(user, unit!.course_id);
    return { unit: unit!, entitlement, decision: decideLessonAccess(user, lesson, entitlement) };
  }

  private async courseModel(courseId: string): Promise<string> {
    const row = await this.db.get<{ calculator_model: string }>("SELECT calculator_model FROM courses WHERE id = ?", [courseId]);
    return row?.calculator_model ?? "casio-fc-200v";
  }

  /** Visible questions: approved for students; everything except rejected for staff previews. */
  private async visibleQuestions(user: User | null, lessonId: string): Promise<QuestionRow[]> {
    const statuses = isStaff(user) ? "('approved','review','draft')" : "('approved')";
    return this.db.all<QuestionRow>(`SELECT * FROM questions WHERE lesson_id = ? AND status IN ${statuses} ORDER BY position`, [lessonId]);
  }

  async publishedVideoFor(targetType: "lesson" | "question", targetId: string) {
    return this.db.get<{ id: string; title: string; storage_key: string; content_type: string }>(
      `SELECT id, title, storage_key, content_type FROM video_assets WHERE target_type = ? AND target_id = ? AND status = 'published'
       ORDER BY version DESC LIMIT 1`,
      [targetType, targetId],
    );
  }

  async getLessonView(user: User | null, slug: string) {
    const lesson = await this.getLessonBySlug(slug);
    if (!lesson) return null;
    const { unit, entitlement, decision } = await this.lessonAccess(user, lesson);
    const base = {
      lesson: { id: lesson.id, slug: lesson.slug, title: lesson.title, description: lesson.description, access: lesson.access, status: lesson.status, minutes: lesson.estimated_minutes },
      unit: { id: unit.id, title: unit.title },
      entitlement,
    };
    if (!decision.allowed) return { ...base, allowed: false as const, reason: decision.reason };

    const model = await this.courseModel(unit.course_id);
    const facts = await getFactStatuses(this.db, model);
    const modelName = getCalculator(model).model.name;
    const examples = parseJson<Array<ExampleView & { calculator: StoredCalculator | null }>>(lesson.examples_json, []).map((example) => {
      const verified = example.calculator ? calculatorVerdict(example.calculator.sequence, facts).verified : false;
      return { ...example, calculator: verified && example.calculator ? { ...example.calculator, modelName } : null };
    });
    const questions = await this.visibleQuestions(user, lesson.id);
    const video = await this.publishedVideoFor("lesson", lesson.id);
    const quiz = await this.db.get<QuizRow>("SELECT * FROM quizzes WHERE lesson_id = ? AND kind = 'lesson'", [lesson.id]);
    const progress = user ? await this.db.get<LessonProgress>("SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?", [user.id, lesson.id]) : null;
    const lessons = await this.db.all<{ slug: string; title: string; status: string; position: number }>(
      "SELECT slug, title, status, position FROM lessons WHERE unit_id = ? ORDER BY position",
      [unit.id],
    );
    const index = lessons.findIndex((l) => l.slug === lesson.slug);
    const next = lessons.slice(index + 1).find((l) => l.status === "published" || isStaff(user)) ?? null;

    if (user) await this.touchProgress(user.id, lesson.id);

    return {
      ...base,
      allowed: true as const,
      summary_md: lesson.summary_md,
      objectives: parseJson<string[]>(lesson.objectives_json, []),
      formulas: parseJson<Array<{ name: string; formula: string; meaning: string }>>(lesson.formulas_json, []),
      examples,
      practice: questions.filter((q) => q.role === "practice").map((q) => this.toStudentQuestion(q, facts)),
      quiz: quiz ? { id: quiz.id, title: quiz.title, count: await this.countVisible(user, parseJson<string[]>(quiz.question_ids_json, [])) } : null,
      video: video ? { id: video.id, title: video.title, url: `/api/academy/media/${video.id}` } : null,
      progress,
      nextLesson: next ? { slug: next.slug, title: next.title } : null,
      staffPreview: isStaff(user) && lesson.status !== "published",
    };
  }

  private async countVisible(user: User | null, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const statuses = isStaff(user) ? "('approved','review','draft')" : "('approved')";
    const row = await this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM questions WHERE id IN (${ids.map(() => "?").join(",")}) AND status IN ${statuses}`,
      ids,
    );
    return Number(row?.n ?? 0);
  }

  toStudentQuestion(q: QuestionRow, facts: Record<string, "pending" | "confirmed" | "rejected">): StudentQuestion {
    const calc = parseJson<StoredCalculator | null>(q.calculator_json, null);
    return {
      id: q.id,
      lessonId: q.lesson_id,
      difficulty: q.difficulty,
      stem: q.stem_md,
      options: parseJson<Array<{ key: string; text: string }>>(q.options_json, []).map(({ key, text }) => ({ key, text })),
      role: q.role,
      hasCalculatorSolution: !!calc && calculatorVerdict(calc.sequence, facts).verified,
      hasVideo: !!q.solution_video_asset_id,
    };
  }

  private async loadQuestionForUser(user: User, questionId: string) {
    const q = await this.db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [questionId]);
    if (!q) throw new AccessDeniedError("not_found");
    if (q.status !== "approved" && !isStaff(user)) throw new AccessDeniedError("not_published");
    const lesson = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [q.lesson_id]);
    const { unit, decision } = await this.lessonAccess(user, lesson!);
    if (!decision.allowed) throw new AccessDeniedError(decision.reason);
    return { q, lesson: lesson!, unit };
  }

  async buildSolution(q: QuestionRow, courseId: string): Promise<SolutionPresentation> {
    const model = await this.courseModel(courseId);
    const facts = await getFactStatuses(this.db, model);
    const calc = parseJson<StoredCalculator | null>(q.calculator_json, null);
    const verification = parseJson<SolutionPresentation["verification"]>(q.verification_json, {
      status: "failed", engineValue: null, checks: [], checkedAt: "",
    });
    let calculator: SolutionPresentation["calculator"] = null;
    let reason: string | null = null;
    if (!calc) reason = "אין פתרון במחשבון לשאלה זו";
    else if (verification.status !== "verified") reason = "הפתרון לא עבר בדיקה מתמטית";
    else {
      const verdict = calculatorVerdict(calc.sequence, facts);
      if (verdict.verified) calculator = { ...calc, modelName: getCalculator(model).model.name };
      else if (!verdict.simulation.ok) reason = `הסימולטור דחה את הרצף: ${verdict.simulation.errors.join(" | ")}`;
      else reason = `ממתין לאישור עובדות המחשבון: ${[...verdict.pendingFacts, ...verdict.rejectedFacts].join(", ")}`;
    }
    const video = q.solution_video_asset_id
      ? await this.db.get<{ id: string; title: string; status: string }>("SELECT id, title, status FROM video_assets WHERE id = ?", [q.solution_video_asset_id])
      : null;
    return {
      questionId: q.id,
      correctKey: q.correct_key,
      explanation: q.short_explanation_md,
      calculator,
      calculatorUnavailableReason: reason,
      formulaSteps: parseJson<Array<{ title: string; body: string }>>(q.solution_steps_json, []).map((s) => ({ title: s.title, body_md: s.body })),
      isCalculation: !!calc || !!verification.engineValue,
      video: video && video.status === "published" ? { id: video.id, title: video.title, url: `/api/academy/media/${video.id}` } : null,
      verification,
    };
  }

  async answerQuestion(user: User, questionId: string, chosenKey: string, context: "practice" | "quiz" = "practice") {
    const { q, lesson, unit } = await this.loadQuestionForUser(user, questionId);
    const options = parseJson<Array<{ key: string }>>(q.options_json, []);
    if (!options.some((o) => o.key === chosenKey)) throw new Error("תשובה לא תקינה");
    const isCorrect = chosenKey === q.correct_key;
    await this.db.run(
      "INSERT INTO question_attempts (id, user_id, question_id, chosen_key, is_correct, context) VALUES (?,?,?,?,?,?)",
      [newId("qa"), user.id, q.id, chosenKey, isCorrect ? 1 : 0, context],
    );
    await this.updatePracticeProgress(user, lesson.id);
    return { isCorrect, chosenKey, solution: await this.buildSolution(q, unit.course_id) };
  }

  /** Solution for a question the user already answered (or staff). */
  async getSolution(user: User, questionId: string) {
    const { q, unit } = await this.loadQuestionForUser(user, questionId);
    if (!isStaff(user)) {
      const attempt = await this.db.get("SELECT id FROM question_attempts WHERE user_id = ? AND question_id = ? LIMIT 1", [user.id, questionId]);
      if (!attempt) throw new AccessDeniedError("answer_first");
    }
    return this.buildSolution(q, unit.course_id);
  }

  private async updatePracticeProgress(user: User, lessonId: string) {
    const practice = await this.db.all<{ id: string }>("SELECT id FROM questions WHERE lesson_id = ? AND role = 'practice' AND status = 'approved'", [lessonId]);
    let done = 0;
    if (practice.length) {
      const answered = await this.db.get<{ n: number }>(
        `SELECT COUNT(DISTINCT question_id) AS n FROM question_attempts WHERE user_id = ? AND question_id IN (${practice.map(() => "?").join(",")})`,
        [user.id, ...practice.map((p) => p.id)],
      );
      done = Number(answered?.n ?? 0) >= practice.length ? 1 : 0;
    }
    await this.touchProgress(user.id, lessonId);
    await this.db.run("UPDATE lesson_progress SET practice_done = MAX(practice_done, ?), last_seen_at = ? WHERE user_id = ? AND lesson_id = ?", [
      done, nowIso(), user.id, lessonId,
    ]);
  }

  private async touchProgress(userId: string, lessonId: string) {
    await this.db.run("INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?,?)", [userId, lessonId]);
    await this.db.run("UPDATE lesson_progress SET last_seen_at = ? WHERE user_id = ? AND lesson_id = ?", [nowIso(), userId, lessonId]);
  }

  async getQuizView(user: User, quizId: string) {
    const quiz = await this.db.get<QuizRow>("SELECT * FROM quizzes WHERE id = ?", [quizId]);
    if (!quiz) return null;
    if (quiz.lesson_id) {
      const lesson = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [quiz.lesson_id]);
      const { decision } = await this.lessonAccess(user, lesson!);
      if (!decision.allowed) throw new AccessDeniedError(decision.reason);
    } else {
      const entitlement = await this.getEntitlement(user, quiz.course_id);
      if (!entitlement.hasAccess) throw new AccessDeniedError("subscription_required");
    }
    const model = await this.courseModel(quiz.course_id);
    const facts = await getFactStatuses(this.db, model);
    const ids = parseJson<string[]>(quiz.question_ids_json, []);
    const rows = await this.questionsByIds(user, ids);
    return {
      quiz: { id: quiz.id, title: quiz.title, kind: quiz.kind, passScore: quiz.pass_score, timeLimitMinutes: quiz.time_limit_minutes, lessonId: quiz.lesson_id },
      questions: rows.map((q) => this.toStudentQuestion(q, facts)),
      lastAttempt: await this.db.get<{ score: number; passed: number; finished_at: string }>(
        "SELECT score, passed, finished_at FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1",
        [user.id, quiz.id],
      ),
    };
  }

  private async questionsByIds(user: User, ids: string[]): Promise<QuestionRow[]> {
    if (!ids.length) return [];
    const statuses = isStaff(user) ? "('approved','review','draft')" : "('approved')";
    const rows = await this.db.all<QuestionRow>(`SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(",")}) AND status IN ${statuses}`, ids);
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  async submitQuiz(user: User, quizId: string, answers: Record<string, string>, startedAt?: string) {
    const view = await this.getQuizView(user, quizId);
    if (!view) throw new AccessDeniedError("not_found");
    if (!view.questions.length) throw new Error("אין שאלות זמינות במבחן");
    const rows = await this.questionsByIds(user, view.questions.map((q) => q.id));
    let correct = 0;
    const results = [];
    for (const q of rows) {
      const chosen = answers[q.id] ?? null;
      const ok = chosen === q.correct_key;
      if (ok) correct++;
      if (chosen) {
        await this.db.run("INSERT INTO question_attempts (id, user_id, question_id, chosen_key, is_correct, context) VALUES (?,?,?,?,?,'quiz')", [
          newId("qa"), user.id, q.id, chosen, ok ? 1 : 0,
        ]);
      }
      results.push({ questionId: q.id, chosenKey: chosen, correctKey: q.correct_key, isCorrect: ok });
    }
    const score = Math.round((correct / rows.length) * 100);
    const passed = score >= view.quiz.passScore;
    await this.db.run(
      "INSERT INTO quiz_attempts (id, user_id, quiz_id, answers_json, score, passed, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?)",
      [newId("qz"), user.id, quizId, JSON.stringify(answers), score, passed ? 1 : 0, startedAt ?? nowIso(), nowIso()],
    );
    if (view.quiz.lessonId && passed) {
      await this.touchProgress(user.id, view.quiz.lessonId);
      await this.db.run("UPDATE lesson_progress SET quiz_passed = 1, completed = 1 WHERE user_id = ? AND lesson_id = ?", [user.id, view.quiz.lessonId]);
    }
    return { score, passed, correct, total: rows.length, passScore: view.quiz.passScore, results };
  }

  async recordVideoProgress(user: User, assetId: string, seconds: number, completed: boolean) {
    const asset = await this.db.get<{ id: string; target_type: string; target_id: string; status: string }>(
      "SELECT id, target_type, target_id, status FROM video_assets WHERE id = ?",
      [assetId],
    );
    if (!asset || asset.status !== "published") throw new AccessDeniedError("not_found");
    const safeSeconds = Math.max(0, Math.min(Math.round(seconds), 6 * 3600));
    const existing = await this.db.get<{ id: string; seconds_watched: number }>(
      "SELECT id, seconds_watched FROM video_views WHERE video_asset_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
      [assetId, user.id],
    );
    if (existing) {
      await this.db.run("UPDATE video_views SET seconds_watched = MAX(seconds_watched, ?), completed = MAX(completed, ?) WHERE id = ?", [
        safeSeconds, completed ? 1 : 0, existing.id,
      ]);
    } else {
      await this.db.run("INSERT INTO video_views (id, video_asset_id, user_id, seconds_watched, completed) VALUES (?,?,?,?,?)", [
        newId("vv"), assetId, user.id, safeSeconds, completed ? 1 : 0,
      ]);
    }
    if (asset.target_type === "lesson") {
      await this.touchProgress(user.id, asset.target_id);
      await this.db.run(
        "UPDATE lesson_progress SET video_seconds = MAX(video_seconds, ?), video_completed = MAX(video_completed, ?) WHERE user_id = ? AND lesson_id = ?",
        [safeSeconds, completed ? 1 : 0, user.id, asset.target_id],
      );
    }
  }

  async getDashboard(user: User) {
    const syllabus = await this.getSyllabus(user);
    if (!syllabus) return null;
    const lessons = syllabus.units.flatMap((u) => u.lessons.map((l) => ({ ...l, unitTitle: u.title })));
    const published = lessons.filter((l) => l.status === "published");
    const completed = published.filter((l) => l.progress?.completed).length;
    const next = published.find((l) => !l.progress?.completed && l.allowed) ?? null;
    const stats = await this.db.get<{ total: number; correct: number }>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(is_correct),0) AS correct FROM question_attempts WHERE user_id = ?",
      [user.id],
    );
    const exams = await this.db.all<QuizRow>("SELECT * FROM quizzes WHERE course_id = ? AND kind IN ('unit','simulation') ORDER BY kind", [syllabus.course.id]);
    const examViews = [];
    for (const exam of exams) {
      const count = await this.countVisible(user, parseJson<string[]>(exam.question_ids_json, []));
      if (count) examViews.push({ id: exam.id, title: exam.title, kind: exam.kind, count, timeLimit: exam.time_limit_minutes });
    }
    return {
      ...syllabus,
      stats: {
        publishedLessons: published.length,
        completedLessons: completed,
        attempts: Number(stats?.total ?? 0),
        accuracy: stats && Number(stats.total) ? Math.round((Number(stats.correct) / Number(stats.total)) * 100) : null,
      },
      next,
      exams: examViews,
    };
  }
}
