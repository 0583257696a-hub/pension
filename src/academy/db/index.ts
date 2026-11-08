import { getConfig } from "../config";
import { migrate } from "./migrate";
import type { SqlDb } from "./types";

export type { SqlDb, Row, SqlParams } from "./types";
export { migrate } from "./migrate";

declare global {
  var __academyDb: Promise<SqlDb> | undefined;
}

/**
 * Returns the process-wide database connection, creating and migrating it on
 * first use. The driver is picked from the environment (see config.ts).
 * In tests, call `setTestDb()` with an in-memory NodeSqliteDb instead.
 */
export function getDb(): Promise<SqlDb> {
  if (!globalThis.__academyDb) {
    globalThis.__academyDb = createDb();
  }
  return globalThis.__academyDb;
}

export function setTestDb(db: SqlDb | undefined): void {
  globalThis.__academyDb = db ? Promise.resolve(db) : undefined;
}

async function createDb(): Promise<SqlDb> {
  const config = getConfig();
  let db: SqlDb;
  switch (config.db.driver) {
    case "d1-http": {
      const { D1HttpDb } = await import("./d1-http");
      const { accountId, databaseId, apiToken } = config.db.d1;
      if (!accountId || !databaseId || !apiToken) {
        throw new Error("D1 HTTP driver selected but CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_API_TOKEN are missing");
      }
      db = new D1HttpDb({ accountId, databaseId, apiToken });
      break;
    }
    case "d1-binding": {
      const { D1BindingDb } = await import("./d1-binding");
      const binding = (globalThis as unknown as { ACADEMY_DB?: unknown }).ACADEMY_DB;
      if (!binding) throw new Error("D1 binding driver selected but no ACADEMY_DB binding is present");
      db = new D1BindingDb(binding as ConstructorParameters<typeof D1BindingDb>[0]);
      break;
    }
    default: {
      const { NodeSqliteDb } = await import("./node-sqlite");
      db = new NodeSqliteDb(config.db.sqliteFile);
    }
  }
  await migrate(db);
  // First run: import the built-in course in review status (nothing is published automatically).
  const hasCourse = await db.get("SELECT id FROM courses LIMIT 1");
  if (!hasCourse && process.env.ACADEMY_SKIP_AUTO_IMPORT !== "1") {
    const [{ seedCourse }, { financeStatisticsCourse }] = await Promise.all([
      import("../content/seed"),
      import("../content/course"),
    ]);
    await seedCourse(db, financeStatisticsCourse);
  }
  return db;
}
