import type { SqlDb } from "./types";
import { migrations } from "./migrations";

/**
 * Applies pending migrations. Idempotent: tracked in the `_migrations` table.
 * Works for node:sqlite and D1 (both accept multi-statement scripts).
 */
export async function migrate(db: SqlDb): Promise<string[]> {
  await db.run(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
  );
  const applied = new Set(
    (await db.all<{ name: string }>("SELECT name FROM _migrations")).map((row) => row.name),
  );
  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await db.batch([...splitStatements(migration.sql).map((sql) => ({ sql })), { sql: "INSERT INTO _migrations (name) VALUES (?)", params: [migration.name] }]);
    newlyApplied.push(migration.name);
  }
  return newlyApplied;
}

/** Splits a migration script into statements (our SQL has no semicolons inside literals). */
export function splitStatements(script: string): string[] {
  return script
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
