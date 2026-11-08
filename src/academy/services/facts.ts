import type { SqlDb } from "../db/types";
import { getCalculator, verdictFor, type CalcSequence, type FactStatus } from "../calculator";

export async function getFactStatuses(db: SqlDb, model: string): Promise<Record<string, FactStatus>> {
  const rows = await db.all<{ fact_key: string; status: FactStatus }>("SELECT fact_key, status FROM calculator_facts WHERE model = ?", [model]);
  return Object.fromEntries(rows.map((r) => [r.fact_key, r.status]));
}

export async function listFacts(db: SqlDb, model: string) {
  const { model: definition } = getCalculator(model);
  const rows = await db.all<{ fact_key: string; status: FactStatus; manual_ref: string | null; note: string | null; reviewed_at: string | null; reviewer_email: string | null }>(
    `SELECT f.fact_key, f.status, f.manual_ref, f.note, f.reviewed_at, u.email AS reviewer_email
     FROM calculator_facts f LEFT JOIN users u ON u.id = f.reviewer_id WHERE f.model = ?`,
    [model],
  );
  const byKey = new Map(rows.map((r) => [r.fact_key, r]));
  return definition.facts.map((fact) => ({ ...fact, ...(byKey.get(fact.key) ?? { status: "pending" as FactStatus, manual_ref: null, note: null, reviewed_at: null, reviewer_email: null }) }));
}

export async function reviewFact(db: SqlDb, model: string, factKey: string, status: "confirmed" | "rejected", manualRef: string, note: string, reviewerId: string) {
  if (!manualRef.trim()) throw new Error("יש לציין עמוד או סעיף במדריך, או 'נבדק על המחשבון'");
  await db.run(
    `INSERT INTO calculator_facts (model, fact_key, status, manual_ref, note, reviewer_id, reviewed_at)
     VALUES (?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(model, fact_key) DO UPDATE SET status=excluded.status, manual_ref=excluded.manual_ref, note=excluded.note,
       reviewer_id=excluded.reviewer_id, reviewed_at=excluded.reviewed_at`,
    [model, factKey, status, manualRef.trim(), note.trim() || null, reviewerId],
  );
}

export function calculatorVerdict(sequence: CalcSequence, statuses: Record<string, FactStatus>) {
  return verdictFor(sequence, statuses);
}
