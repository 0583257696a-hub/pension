import { getConfig } from "../config";
import { cloudflareEnv } from "../platform";
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
  const env = await cloudflareEnv();
  // On Cloudflare the D1 binding wins unless a driver is set explicitly.
  const driver = process.env.ACADEMY_DB_DRIVER ? config.db.driver : env?.ACADEMY_DB ? "d1-binding" : config.db.driver;
  let db: SqlDb;
  switch (driver) {
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
      const binding = env?.ACADEMY_DB;
      if (!binding) throw new Error("D1 binding driver selected but no ACADEMY_DB binding is present (see wrangler.jsonc)");
      db = new D1BindingDb(binding as ConstructorParameters<typeof D1BindingDb>[0]);
      break;
    }
    default: {
      if (env) throw new Error("No ACADEMY_DB D1 binding found. Add it in wrangler.jsonc (d1_databases).");
      const { NodeSqliteDb } = await import("./node-sqlite");
      db = new NodeSqliteDb(config.db.sqliteFile);
    }
  }
  await migrate(db);
  // Import the built-in course on first run, and again whenever its content
  // version changes. The import never deletes rows and never publishes:
  // new and changed items land in review.
  if (process.env.ACADEMY_SKIP_AUTO_IMPORT !== "1") {
    const [{ seedCourse }, { financeStatisticsCourse, CONTENT_VERSION }] = await Promise.all([
      import("../content/seed"),
      import("../content/course"),
    ]);
    const stored = await db.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'content_version'");
    if (stored?.value !== CONTENT_VERSION) {
      await seedCourse(db, financeStatisticsCourse);
      await db.run(
        "INSERT INTO app_meta (key, value) VALUES ('content_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [CONTENT_VERSION],
      );
    }
  }
  return db;
}
