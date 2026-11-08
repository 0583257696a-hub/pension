/**
 * Minimal SQL database abstraction in the SQLite dialect.
 *
 * The schema and every query in the academy are written in SQLite SQL so the
 * same code runs against:
 *   - node:sqlite (local development, tests)              -> NodeSqliteDb
 *   - Cloudflare D1 through the official REST API           -> D1HttpDb
 *   - Cloudflare D1 through a Workers binding (OpenNext)    -> D1BindingDb
 */
export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[];
export type Row = Record<string, SqlValue>;

export interface RunResult {
  changes: number;
  lastInsertRowid?: number;
}

export interface SqlDb {
  /** Execute a statement that returns no rows. */
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  /** Execute a statement and return every row. */
  all<T extends object = Row>(sql: string, params?: SqlParams): Promise<T[]>;
  /** Execute a statement and return the first row or null. */
  get<T extends object = Row>(sql: string, params?: SqlParams): Promise<T | null>;
  /** Execute a script with several statements separated by semicolons. */
  exec(script: string): Promise<void>;
  /** Run several statements as one unit. Rolls back on failure where the driver supports it. */
  batch(statements: Array<{ sql: string; params?: SqlParams }>): Promise<void>;
  close(): Promise<void>;
  readonly driver: "sqlite" | "d1-http" | "d1-binding";
}
