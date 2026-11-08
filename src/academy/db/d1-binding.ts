import type { Row, RunResult, SqlDb, SqlParams } from "./types";

/**
 * Structural type of the Cloudflare D1 binding (subset we use), so this file
 * compiles without the Workers type package.
 */
export interface D1BindingLike {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
  batch(statements: unknown[]): Promise<unknown>;
  exec(script: string): Promise<unknown>;
}

/** SqlDb on top of a D1 binding, for deployments on Cloudflare Workers/Pages. */
export class D1BindingDb implements SqlDb {
  readonly driver = "d1-binding" as const;

  constructor(private readonly binding: D1BindingLike) {}

  async run(sql: string, params: SqlParams = []): Promise<RunResult> {
    const result = await this.binding.prepare(sql).bind(...params).run();
    return { changes: result.meta?.changes ?? 0, lastInsertRowid: result.meta?.last_row_id };
  }

  async all<T extends object = Row>(sql: string, params: SqlParams = []): Promise<T[]> {
    const result = await this.binding.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  }

  async get<T extends object = Row>(sql: string, params: SqlParams = []): Promise<T | null> {
    return this.binding.prepare(sql).bind(...params).first<T>();
  }

  async exec(script: string): Promise<void> {
    await this.binding.exec(script);
  }

  async batch(statements: Array<{ sql: string; params?: SqlParams }>): Promise<void> {
    await this.binding.batch(statements.map((s) => this.binding.prepare(s.sql).bind(...(s.params ?? []))));
  }

  async close(): Promise<void> {
    /* bindings are managed by the platform */
  }
}
