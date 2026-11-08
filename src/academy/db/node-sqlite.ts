import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Row, RunResult, SqlDb, SqlParams } from "./types";

/**
 * SqlDb implementation on top of Node's built-in SQLite (Node >= 22.13).
 * Used for local development and for the automated tests (":memory:").
 */
export class NodeSqliteDb implements SqlDb {
  readonly driver = "sqlite" as const;
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") {
      mkdirSync(path.dirname(file), { recursive: true });
    }
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA foreign_keys = ON;");
    if (file !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
  }

  async run(sql: string, params: SqlParams = []): Promise<RunResult> {
    const result = this.db.prepare(sql).run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }

  async all<T extends object = Row>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }

  async get<T extends object = Row>(sql: string, params: SqlParams = []): Promise<T | null> {
    const row = this.db.prepare(sql).get(...params);
    return (row as unknown as T) ?? null;
  }

  async exec(script: string): Promise<void> {
    this.db.exec(script);
  }

  async batch(statements: Array<{ sql: string; params?: SqlParams }>): Promise<void> {
    this.db.exec("BEGIN");
    try {
      for (const statement of statements) {
        this.db.prepare(statement.sql).run(...(statement.params ?? []));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
