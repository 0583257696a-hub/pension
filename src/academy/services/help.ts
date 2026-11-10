import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { isStaff } from "../auth/service";
import { newId, nowIso } from "../lib/ids";
import { AccessDeniedError } from "./learning";

export class HelpError extends Error {}

export type HelpStatus = "new" | "in_progress" | "answered" | "closed";
export const HELP_STATUS_LABEL: Record<HelpStatus, string> = { new: "חדשה", in_progress: "בטיפול", answered: "נענתה", closed: "נסגרה" };

export interface HelpRequestRow {
  id: string; user_id: string; course_id: string; lesson_id: string | null; assignment_id: string | null; attempt_id: string | null;
  question_id: string | null; question_version: number | null; question_position: number | null; chosen_key: string | null;
  message: string; status: HelpStatus; assigned_to: string | null; student_seen_at: string | null; created_at: string; updated_at: string;
}

/**
 * "צריכים עזרה?" — human support tied to a specific question. The context
 * (course, lesson, assignment, question and version, attempt, chosen answer) is
 * attached on the server from the attempt, never typed by the student. No
 * automatic AI answers.
 */
export class HelpService {
  constructor(private readonly db: SqlDb) {}

  async create(user: User, input: { attemptId: string; questionId: string; message: string }) {
    const message = input.message.trim();
    if (message.length < 3) throw new HelpError("כתבו בכמה מילים מה לא היה ברור");
    if (message.length > 4000) throw new HelpError("ההודעה ארוכה מדי");
    const recent = await this.db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM help_requests WHERE user_id = ? AND created_at > ?",
      [user.id, new Date(Date.now() - 3600_000).toISOString()],
    );
    if (Number(recent?.n ?? 0) >= 10) throw new HelpError("שלחתם הרבה פניות בשעה האחרונה. נסו שוב מאוחר יותר.");
    const ctx = await this.db.get<{ attempt_id: string; user_id: string; assignment_id: string; course_id: string; lesson_id: string; question_version: number; position: number; chosen_key: string | null }>(
      `SELECT t.id AS attempt_id, t.user_id, a.id AS assignment_id, a.course_id, a.lesson_id, x.question_version, x.position, x.chosen_key
       FROM assignment_attempts t JOIN assignments a ON a.id = t.assignment_id
       JOIN attempt_answers x ON x.attempt_id = t.id AND x.question_id = ?
       WHERE t.id = ?`,
      [input.questionId, input.attemptId],
    );
    if (!ctx || ctx.user_id !== user.id) throw new AccessDeniedError("not_found");
    const id = newId("help");
    await this.db.batch([
      {
        sql: `INSERT INTO help_requests (id, user_id, course_id, lesson_id, assignment_id, attempt_id, question_id, question_version, question_position, chosen_key, message, student_seen_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        params: [id, user.id, ctx.course_id, ctx.lesson_id, ctx.assignment_id, ctx.attempt_id, input.questionId, ctx.question_version, ctx.position, ctx.chosen_key, message, nowIso()],
      },
      { sql: "INSERT INTO help_messages (id, request_id, author_id, author_kind, body) VALUES (?,?,?,'student',?)", params: [newId("hm"), id, user.id, message] },
    ]);
    return { id };
  }

  async listForStudent(user: User) {
    return this.db.all<HelpRequestRow & { assignment_title: string | null; replies: number; unread: number }>(
      `SELECT h.*, a.title AS assignment_title,
         (SELECT COUNT(*) FROM help_messages m WHERE m.request_id = h.id AND m.author_kind = 'staff') AS replies,
         (SELECT COUNT(*) FROM help_messages m WHERE m.request_id = h.id AND m.author_kind = 'staff' AND (h.student_seen_at IS NULL OR m.created_at > h.student_seen_at)) AS unread
       FROM help_requests h LEFT JOIN assignments a ON a.id = h.assignment_id WHERE h.user_id = ? ORDER BY h.updated_at DESC`,
      [user.id],
    );
  }

  async unreadCount(user: User): Promise<number> {
    const row = await this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM help_messages m JOIN help_requests h ON h.id = m.request_id
       WHERE h.user_id = ? AND m.author_kind = 'staff' AND (h.student_seen_at IS NULL OR m.created_at > h.student_seen_at)`,
      [user.id],
    );
    return Number(row?.n ?? 0);
  }

  async thread(user: User, requestId: string) {
    const request = await this.db.get<HelpRequestRow & { email: string; full_name: string; assignment_title: string | null; lesson_title: string | null; stem: string | null; course_title: string }>(
      `SELECT h.*, u.email, u.full_name, a.title AS assignment_title, l.title AS lesson_title, c.title AS course_title,
         (SELECT json_extract(v.snapshot_json, '$.stem') FROM question_versions v WHERE v.question_id = h.question_id AND v.version = h.question_version) AS stem
       FROM help_requests h JOIN users u ON u.id = h.user_id JOIN courses c ON c.id = h.course_id
       LEFT JOIN assignments a ON a.id = h.assignment_id LEFT JOIN lessons l ON l.id = h.lesson_id WHERE h.id = ?`,
      [requestId],
    );
    if (!request || (request.user_id !== user.id && !isStaff(user))) throw new AccessDeniedError("not_found");
    const messages = await this.db.all<{ id: string; author_kind: "student" | "staff"; body: string; created_at: string; author_name: string | null }>(
      `SELECT m.id, m.author_kind, m.body, m.created_at, u.full_name AS author_name FROM help_messages m LEFT JOIN users u ON u.id = m.author_id
       WHERE m.request_id = ? ORDER BY m.created_at`,
      [requestId],
    );
    if (request.user_id === user.id) await this.db.run("UPDATE help_requests SET student_seen_at = ? WHERE id = ?", [nowIso(), requestId]);
    return { request, messages };
  }

  async studentReply(user: User, requestId: string, body: string) {
    const request = await this.db.get<HelpRequestRow>("SELECT * FROM help_requests WHERE id = ?", [requestId]);
    if (!request || request.user_id !== user.id) throw new AccessDeniedError("not_found");
    if (!body.trim()) throw new HelpError("ההודעה ריקה");
    await this.db.batch([
      { sql: "INSERT INTO help_messages (id, request_id, author_id, author_kind, body) VALUES (?,?,?,'student',?)", params: [newId("hm"), requestId, user.id, body.trim()] },
      { sql: "UPDATE help_requests SET status = CASE WHEN status IN ('answered','closed') THEN 'new' ELSE status END, updated_at = ?, student_seen_at = ? WHERE id = ?", params: [nowIso(), nowIso(), requestId] },
    ]);
  }

  // ---------------------------------------------------------------- staff

  async inbox(filter: { status?: HelpStatus | "open" } = {}) {
    const where = filter.status === "open" || !filter.status ? "h.status IN ('new','in_progress')" : "h.status = ?";
    return this.db.all<HelpRequestRow & { email: string; full_name: string; assignment_title: string | null; lesson_title: string | null; assignee: string | null }>(
      `SELECT h.*, u.email, u.full_name, a.title AS assignment_title, l.title AS lesson_title, s.full_name AS assignee
       FROM help_requests h JOIN users u ON u.id = h.user_id LEFT JOIN assignments a ON a.id = h.assignment_id
       LEFT JOIN lessons l ON l.id = h.lesson_id LEFT JOIN users s ON s.id = h.assigned_to
       WHERE ${where} ORDER BY h.created_at ASC LIMIT 200`,
      filter.status && filter.status !== "open" ? [filter.status] : [],
    );
  }

  async counts() {
    const rows = await this.db.all<{ status: HelpStatus; n: number }>("SELECT status, COUNT(*) AS n FROM help_requests GROUP BY status");
    const out: Record<HelpStatus, number> = { new: 0, in_progress: 0, answered: 0, closed: 0 };
    for (const r of rows) out[r.status] = Number(r.n);
    return out;
  }

  async staffReply(staff: User, requestId: string, body: string, close = false) {
    if (!isStaff(staff)) throw new AccessDeniedError("forbidden");
    if (!body.trim()) throw new HelpError("התשובה ריקה");
    await this.db.batch([
      { sql: "INSERT INTO help_messages (id, request_id, author_id, author_kind, body) VALUES (?,?,?,'staff',?)", params: [newId("hm"), requestId, staff.id, body.trim()] },
      {
        sql: "UPDATE help_requests SET status = ?, assigned_to = COALESCE(assigned_to, ?), updated_at = ? WHERE id = ?",
        params: [close ? "closed" : "answered", staff.id, nowIso(), requestId],
      },
      {
        sql: "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)",
        params: [newId("aud"), staff.id, "help.reply", "help_request", requestId, JSON.stringify({ close })],
      },
    ]);
  }

  async setStatus(staff: User, requestId: string, status: HelpStatus) {
    if (!isStaff(staff)) throw new AccessDeniedError("forbidden");
    if (!(status in HELP_STATUS_LABEL)) throw new HelpError("סטטוס לא תקין");
    await this.db.run("UPDATE help_requests SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), requestId]);
  }

  async assign(staff: User, requestId: string, assigneeId: string | null) {
    if (!isStaff(staff)) throw new AccessDeniedError("forbidden");
    await this.db.run("UPDATE help_requests SET assigned_to = ?, status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END, updated_at = ? WHERE id = ?", [
      assigneeId, nowIso(), requestId,
    ]);
  }
}
