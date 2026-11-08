import type { SqlDb } from "./types";
import { migrations } from "./migrations";

/**
 * Applies pending migrations. Idempotent: tracked in the `_migrations` table.
 * Works for node:sqlite and D1 (both accept multi-statement scripts).
 */
export async function migrate(db: SqlDb): Promise<string[]> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));",
  );
  const applied = new Set(
    (await db.all<{ name: string }>("SELECT name FROM _migrations")).map((row) => row.name),
  );
  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await db.exec(migration.sql);
    await db.run("INSERT INTO _migrations (name) VALUES (?)", [migration.name]);
    newlyApplied.push(migration.name);
  }
  return newlyApplied;
}
