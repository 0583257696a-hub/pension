import type { SqlDb } from "../db/types";
import { contentHash, type VerificationReport } from "../content/verify";
import { parseJson } from "../lib/json";
import type { QuestionRow, StoredCalculator } from "./types";

/** The immutable content of one approved question version. Grading and the student view read only this. */
export interface QuestionSnapshot {
  id: string;
  version: number;
  lessonId: string;
  difficulty: number;
  stem: string;
  options: Array<{ key: string; text: string; value?: number }>;
  correctKey: string;
  explanation: string;
  steps: Array<{ title: string; body: string }>;
  calculator: StoredCalculator | null;
  verification: VerificationReport & { check?: { expression: string; tolerance: number } | null };
}

function snapshotOf(q: QuestionRow, version: number): QuestionSnapshot {
  return {
    id: q.id,
    version,
    lessonId: q.lesson_id,
    difficulty: q.difficulty,
    stem: q.stem_md,
    options: parseJson(q.options_json, []),
    correctKey: q.correct_key,
    explanation: q.short_explanation_md,
    steps: parseJson(q.solution_steps_json, []),
    calculator: parseJson<StoredCalculator | null>(q.calculator_json, null),
    verification: parseJson(q.verification_json, { status: "failed", engineValue: null, checks: [], checkedAt: "" }),
  };
}

function hashOf(q: QuestionRow): string {
  return contentHash({
    stem: q.stem_md, options: q.options_json, correct: q.correct_key, explanation: q.short_explanation_md,
    steps: q.solution_steps_json, calculator: q.calculator_json,
  });
}

/**
 * Freezes the current content of an approved question as a version. If the
 * content is unchanged since the latest version, that version is reused, so
 * repeated approvals never create duplicates.
 */
export async function snapshotQuestion(db: SqlDb, questionId: string, actorId: string | null): Promise<number> {
  const q = await db.get<QuestionRow & { version: number }>("SELECT * FROM questions WHERE id = ?", [questionId]);
  if (!q) throw new Error("שאלה לא נמצאה");
  const hash = hashOf(q);
  const latest = await db.get<{ version: number; content_hash: string }>(
    "SELECT version, content_hash FROM question_versions WHERE question_id = ? ORDER BY version DESC LIMIT 1",
    [questionId],
  );
  if (latest && latest.content_hash === hash) return latest.version;
  const version = latest ? latest.version + 1 : 1;
  await db.batch([
    {
      sql: "INSERT INTO question_versions (question_id, version, content_hash, snapshot_json, created_by) VALUES (?,?,?,?,?)",
      params: [questionId, version, hash, JSON.stringify(snapshotOf(q, version)), actorId],
    },
    { sql: "UPDATE questions SET version = ? WHERE id = ?", params: [version, questionId] },
  ]);
  return version;
}

/** True when the live question differs from its latest frozen version (a new approval is needed). */
export async function hasUnversionedChanges(db: SqlDb, questionId: string): Promise<boolean> {
  const q = await db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [questionId]);
  if (!q) return false;
  const latest = await db.get<{ content_hash: string }>(
    "SELECT content_hash FROM question_versions WHERE question_id = ? ORDER BY version DESC LIMIT 1",
    [questionId],
  );
  return !latest || latest.content_hash !== hashOf(q);
}

export async function loadSnapshots(db: SqlDb, refs: Array<{ questionId: string; questionVersion: number }>): Promise<Map<string, QuestionSnapshot>> {
  const out = new Map<string, QuestionSnapshot>();
  if (!refs.length) return out;
  const rows = await db.all<{ question_id: string; version: number; snapshot_json: string }>(
    `SELECT question_id, version, snapshot_json FROM question_versions WHERE ${refs.map(() => "(question_id = ? AND version = ?)").join(" OR ")}`,
    refs.flatMap((r) => [r.questionId, r.questionVersion]),
  );
  for (const row of rows) out.set(`${row.question_id}@${row.version}`, JSON.parse(row.snapshot_json));
  return out;
}
