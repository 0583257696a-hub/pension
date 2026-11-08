import { describe, expect, it } from "vitest";
import { NodeSqliteDb } from "../db/node-sqlite";
import { migrate } from "../db/migrate";
import { D1HttpDb } from "../db/d1-http";

describe("database layer", () => {
  it("migrates an in-memory sqlite database idempotently", async () => {
    const db = new NodeSqliteDb(":memory:");
    const first = await migrate(db);
    expect(first).toEqual(["0001_init"]);
    const second = await migrate(db);
    expect(second).toEqual([]);
    const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = tables.map((t) => t.name);
    for (const expected of ["users", "sessions", "courses", "units", "lessons", "questions", "quizzes", "subscriptions", "video_assets", "notebooks", "production_packages", "tutor_threads"]) {
      expect(names).toContain(expected);
    }
    await db.close();
  });

  it("rolls back a failed batch", async () => {
    const db = new NodeSqliteDb(":memory:");
    await migrate(db);
    await expect(
      db.batch([
        { sql: "INSERT INTO courses (id, slug, title) VALUES (?,?,?)", params: ["c1", "a", "A"] },
        { sql: "INSERT INTO courses (id, slug, title) VALUES (?,?,?)", params: ["c2", "a", "B"] },
      ]),
    ).rejects.toThrow();
    const rows = await db.all("SELECT id FROM courses");
    expect(rows).toHaveLength(0);
    await db.close();
  });

  it("talks to the D1 REST endpoint with the documented request shape", async () => {
    const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: headers.get("authorization") });
      return new Response(
        JSON.stringify({ success: true, result: [{ success: true, results: [{ id: "x", n: 1 }], meta: { changes: 1, last_row_id: 7 } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const db = new D1HttpDb({ accountId: "acc", databaseId: "dbid", apiToken: "tok", fetchImpl });
    const rows = await db.all("SELECT * FROM t WHERE id = ?", ["x"]);
    expect(rows).toEqual([{ id: "x", n: 1 }]);
    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/acc/d1/database/dbid/query");
    expect(calls[0].body).toEqual({ sql: "SELECT * FROM t WHERE id = ?", params: ["x"] });
    expect(calls[0].auth).toBe("Bearer tok");
    const run = await db.run("DELETE FROM t");
    expect(run.changes).toBe(1);
    expect(run.lastInsertRowid).toBe(7);
  });
});
