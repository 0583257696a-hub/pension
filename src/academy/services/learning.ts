import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { isStaff } from "../auth/service";
import { decideLessonAccess, EntitlementService, type Entitlement } from "../billing/entitlements";
import { getCalculator } from "../calculator";
import { newId, nowIso } from "../lib/ids";
import { parseJson } from "../lib/json";
import { calculatorVerdict, getFactStatuses } from "./facts";
import type { CourseRow, LessonRow, StoredCalculator, UnitRow } from "./types";

export class AccessDeniedError extends Error {
  constructor(readonly reason: string) {
    super(
      reason === "login_required" ? "נדרשת התחברות"
        : reason === "subscription_required" ? "התוכן זמין לתלמידים שרכשו את הקורס"
          : reason === "not_published" ? "התוכן עדיין לא פורסם"
            : "התוכן אינו זמין",
    );
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

export type LessonState = "not_started" | "in_progress" | "completed";

export const LESSON_STATE_LABEL: Record<LessonState, string> = { not_started: "טרם התחיל", in_progress: "בתהליך", completed: "הושלם" };

type NumberedLesson = LessonRow & { number: number | null; topics_json: string; unit_title: string; unit_position: number };

/**
 * Student-facing reads. Everything here is pre-produced, approved content:
 * nothing is generated while a student studies.
 */
export class LearningService {
  private readonly entitlements: EntitlementService;
  constructor(private readonly db: SqlDb) {
    this.entitlements = new EntitlementService(db);
  }

  async getCourse(): Promise<CourseRow | null> {
    return this.db.get<CourseRow>("SELECT * FROM courses WHERE status = 'published' ORDER BY created_at LIMIT 1");
  }

  async getCourseBySlug(slug: string): Promise<CourseRow | null> {
    return this.db.get<CourseRow>("SELECT * FROM courses WHERE slug = ? AND status = 'published'", [slug]);
  }

  async listCourses(): Promise<CourseRow[]> {
    return this.db.all<CourseRow>("SELECT * FROM courses WHERE status = 'published' ORDER BY created_at");
  }

  async getEntitlement(user: User | null, courseId: string): Promise<Entitlement> {
    return this.entitlements.getEntitlement(user, courseId);
  }

  async chapters(courseId: string) {
    const rows = await this.db.all<{ id: string; number: number; part: string; title: string; topics_json: string }>(
      "SELECT * FROM chapters WHERE course_id = ? ORDER BY number",
      [courseId],
    );
    return rows.map((c) => ({ id: c.id, number: c.number, part: c.part as "finance" | "statistics" | "investments", title: c.title, topics: parseJson<string[]>(c.topics_json, []) }));
  }

  private async numberedLessons(courseId: string): Promise<NumberedLesson[]> {
    return this.db.all<NumberedLesson>(
      `SELECT l.*, u.title AS unit_title, u.position AS unit_position FROM lessons l JOIN units u ON u.id = l.unit_id
       WHERE u.course_id = ? AND l.number IS NOT NULL ORDER BY l.number`,
      [courseId],
    );
  }

  private async officialGrades(userId: string): Promise<Map<string, { score: number; attemptId: string }>> {
    const rows = await this.db.all<{ lesson_id: string; score: number; id: string }>(
      `SELECT a.lesson_id, t.score, t.id FROM assignment_attempts t JOIN assignments a ON a.id = t.assignment_id
       WHERE t.user_id = ? AND t.kind = 'official' AND t.status = 'submitted'`,
      [userId],
    );
    return new Map(rows.map((r) => [r.lesson_id, { score: Number(r.score), attemptId: r.id }]));
  }

  /** The numbered lesson list (spec §5): one row per lesson, with its assignment and the student's state. */
  async getSyllabus(user: User | null, courseId?: string) {
    const course = courseId ? await this.db.get<CourseRow>("SELECT * FROM courses WHERE id = ?", [courseId]) : await this.getCourse();
    if (!course) return null;
    const lessons = await this.numberedLessons(course.id);
    const progress = user ? await this.db.all<LessonProgress & { lesson_id: string }>("SELECT * FROM lesson_progress WHERE user_id = ?", [user.id]) : [];
    const byLesson = new Map(progress.map((p) => [p.lesson_id, p]));
    const grades = user ? await this.officialGrades(user.id) : new Map();
    const assignments = await this.db.all<{ id: string; lesson_id: string; number: number; title: string; status: string; version: number }>(
      "SELECT id, lesson_id, number, title, status, version FROM assignments WHERE course_id = ?",
      [course.id],
    );
    const assignmentBy = new Map(assignments.map((a) => [a.lesson_id, a]));
    const chapterRows = await this.db.all<{ lesson_id: string; number: number; title: string }>(
      `SELECT lc.lesson_id, c.number, c.title FROM lesson_chapters lc JOIN chapters c ON c.id = lc.chapter_id WHERE c.course_id = ? ORDER BY c.number`,
      [course.id],
    );
    const entitlement = await this.getEntitlement(user, course.id);
    const staff = isStaff(user);
    const rows = lessons.map((l) => {
      const access = decideLessonAccess(user, l, entitlement);
      const p = byLesson.get(l.id) ?? null;
      const grade = grades.get(l.id) ?? null;
      const a = assignmentBy.get(l.id);
      const assignmentPublished = !!a && a.status === "published" && a.version > 0;
      const state: LessonState = grade || p?.completed ? "completed" : p ? "in_progress" : "not_started";
      return {
        id: l.id,
        number: l.number!,
        slug: l.slug,
        title: l.title,
        description: l.description,
        part: l.unit_title,
        topics: parseJson<string[]>(l.topics_json, []),
        chapters: chapterRows.filter((c) => c.lesson_id === l.id).map((c) => ({ number: c.number, title: c.title })),
        access: l.access,
        status: l.status,
        minutes: l.estimated_minutes,
        available: l.status === "published" || staff,
        allowed: access.allowed,
        lockReason: access.allowed ? null : access.reason,
        state,
        progress: p,
        assignment: a && (assignmentPublished || staff) ? { id: a.id, number: a.number, title: a.title, published: assignmentPublished, grade: grade?.score ?? null, attemptId: grade?.attemptId ?? null } : null,
      };
    });
    return { course, entitlement, lessons: rows };
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

  async publishedVideoFor(targetType: "lesson" | "question", targetId: string) {
    return this.db.get<{ id: string; title: string; storage_key: string; content_type: string; duration_seconds: number | null }>(
      `SELECT id, title, storage_key, content_type, duration_seconds FROM video_assets WHERE target_type = ? AND target_id = ? AND status = 'published'
       ORDER BY version DESC LIMIT 1`,
      [targetType, targetId],
    );
  }

  /** The lesson page (spec §7): header, materials above the video, video with checkpoints, lesson questions, homework. */
  async getLessonView(user: User | null, slug: string) {
    const lesson = await this.db.get<LessonRow & { number: number | null; topics_json: string; checkpoints_json: string; video_chapters_json: string }>(
      "SELECT * FROM lessons WHERE slug = ?",
      [slug],
    );
    if (!lesson) return null;
    const { unit, entitlement, decision } = await this.lessonAccess(user, lesson);
    const chapters = await this.db.all<{ number: number; title: string }>(
      "SELECT c.number, c.title FROM lesson_chapters lc JOIN chapters c ON c.id = lc.chapter_id WHERE lc.lesson_id = ? ORDER BY c.number",
      [lesson.id],
    );
    const base = {
      lesson: {
        id: lesson.id, slug: lesson.slug, number: lesson.number, title: lesson.title, description: lesson.description, access: lesson.access,
        status: lesson.status, minutes: lesson.estimated_minutes, topics: parseJson<string[]>(lesson.topics_json, []), chapters,
      },
      unit: { id: unit.id, title: unit.title },
      courseId: unit.course_id,
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
    const video = await this.publishedVideoFor("lesson", lesson.id);
    const progress = user ? await this.db.get<LessonProgress>("SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?", [user.id, lesson.id]) : null;
    const materials = await this.db.all<{ id: string; kind: string; title: string; version: number; size_bytes: number; status: string }>(
      `SELECT id, kind, title, version, size_bytes, status FROM lesson_assets WHERE lesson_id = ? AND status = ${isStaff(user) ? "status" : "'published'"}
       AND status != 'superseded' ORDER BY CASE kind WHEN 'questions_pdf' THEN 0 WHEN 'formulas_pdf' THEN 1 WHEN 'summary_pdf' THEN 2 WHEN 'homework_pdf' THEN 3 ELSE 4 END, version DESC`,
      [lesson.id],
    );
    // One file per kind: the published one (staff also see the newest draft when nothing is published).
    const seen = new Set<string>();
    const files = materials
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "published" ? -1 : 1))
      .filter((m) => (m.kind === "supplement_pdf" ? true : seen.has(m.kind) ? false : (seen.add(m.kind), true)));
    const assignment = await this.db.get<{ id: string; number: number; title: string; status: string; version: number; items_json: string | null }>(
      `SELECT a.id, a.number, a.title, a.status, a.version, v.items_json FROM assignments a
       LEFT JOIN assignment_versions v ON v.assignment_id = a.id AND v.version = a.version WHERE a.lesson_id = ?`,
      [lesson.id],
    );
    const grade = user
      ? await this.db.get<{ id: string; score: number; correct_count: number; total_count: number }>(
          `SELECT t.id, t.score, t.correct_count, t.total_count FROM assignment_attempts t JOIN assignments a ON a.id = t.assignment_id
           WHERE t.user_id = ? AND a.lesson_id = ? AND t.kind = 'official' AND t.status = 'submitted'`,
          [user.id, lesson.id],
        )
      : null;
    const syllabus = await this.getSyllabus(user, unit.course_id);
    const list = (syllabus?.lessons ?? []).filter((l) => l.available);
    const index = list.findIndex((l) => l.id === lesson.id);

    if (user) await this.touchProgress(user.id, lesson.id);

    return {
      ...base,
      allowed: true as const,
      summary_md: lesson.summary_md,
      objectives: parseJson<string[]>(lesson.objectives_json, []),
      formulas: parseJson<Array<{ name: string; formula: string; meaning: string }>>(lesson.formulas_json, []),
      examples,
      checkpoints: parseJson<Array<{ atSeconds: number | null; question: number; title: string }>>(lesson.checkpoints_json, []),
      videoChapters: parseJson<Array<{ atSeconds: number | null; title: string }>>(lesson.video_chapters_json, []),
      materials: files.map((f) => ({ id: f.id, kind: f.kind, title: f.title, version: f.version, sizeBytes: f.size_bytes, draft: f.status !== "published" })),
      video: video ? { id: video.id, title: video.title, url: `/api/academy/media/${video.id}`, durationSeconds: video.duration_seconds } : null,
      assignment:
        assignment && ((assignment.status === "published" && assignment.version > 0) || isStaff(user))
          ? {
              id: assignment.id, number: assignment.number, title: assignment.title, published: assignment.status === "published" && assignment.version > 0,
              questionCount: assignment.items_json ? JSON.parse(assignment.items_json).length : 0,
              grade: grade ? { score: Number(grade.score), correct: grade.correct_count, total: grade.total_count, attemptId: grade.id } : null,
            }
          : null,
      progress,
      prevLesson: index > 0 ? { slug: list[index - 1].slug, title: list[index - 1].title } : null,
      nextLesson: index >= 0 && index < list.length - 1 ? { slug: list[index + 1].slug, title: list[index + 1].title, allowed: list[index + 1].allowed } : null,
      courseLessons: list.map((l) => ({ number: l.number, slug: l.slug, title: l.title, state: l.state, allowed: l.allowed })),
      staffPreview: isStaff(user) && lesson.status !== "published",
    };
  }

  private async touchProgress(userId: string, lessonId: string) {
    await this.db.run("INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?,?)", [userId, lessonId]);
    await this.db.run("UPDATE lesson_progress SET last_seen_at = ? WHERE user_id = ? AND lesson_id = ?", [nowIso(), userId, lessonId]);
  }

  async recordVideoProgress(user: User, assetId: string, seconds: number, completed: boolean) {
    const asset = await this.db.get<{ id: string; target_type: string; target_id: string; status: string }>(
      "SELECT id, target_type, target_id, status FROM video_assets WHERE id = ?",
      [assetId],
    );
    if (!asset || asset.status !== "published") throw new AccessDeniedError("not_found");
    const safeSeconds = Math.max(0, Math.min(Math.round(seconds), 6 * 3600));
    const existing = await this.db.get<{ id: string }>(
      "SELECT id FROM video_views WHERE video_asset_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
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

  /** "הקורסים שלי": courses the student can open, with simple progress and assignment grades. */
  async getMyCourses(user: User) {
    const courses = await this.listCourses();
    const out = [];
    for (const course of courses) {
      const syllabus = await this.getSyllabus(user, course.id);
      if (!syllabus) continue;
      const published = syllabus.lessons.filter((l) => l.status === "published");
      const completed = published.filter((l) => l.state === "completed").length;
      const next = published.find((l) => l.state !== "completed" && l.allowed) ?? null;
      const grades = syllabus.lessons.filter((l) => l.assignment?.grade !== null && l.assignment?.grade !== undefined)
        .map((l) => ({ number: l.assignment!.number, title: l.assignment!.title, score: l.assignment!.grade!, attemptId: l.assignment!.attemptId! }));
      out.push({
        course,
        entitlement: syllabus.entitlement,
        publishedLessons: published.length,
        completedLessons: completed,
        next: next ? { slug: next.slug, number: next.number, title: next.title } : null,
        grades,
        lessons: syllabus.lessons,
      });
    }
    return out;
  }
}
