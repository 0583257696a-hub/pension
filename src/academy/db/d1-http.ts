import type { Row, RunResult, SqlDb, SqlParams } from "./types";

/**
 * SqlDb implementation that talks to Cloudflare D1 through the official
 * REST API:
 *   POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query
 *   body: { "sql": "...", "params": [...] }
 *
 * This lets the Next.js server run anywhere (Netlify, Node, Vercel) while the
 * data lives in D1. When the app is deployed on Cloudflare itself, prefer the
 * binding adapter (D1BindingDb), which avoids the HTTP round-trip.
 */
export interface D1HttpConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

interface D1QueryResult {
  results?: Row[];
  success: boolean;
  meta?: { changes?: number; last_row_id?: number; rows_written?: number };
}

interface D1Envelope {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: D1QueryResult[];
}

export class D1HttpDb implements SqlDb {
  readonly driver = "d1-http" as const;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: D1HttpConfig) {
    const base = config.baseUrl ?? "https://api.cloudflare.com/client/v4";
    this.endpoint = `${base}/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async query(sql: string, params: SqlParams = []): Promise<D1QueryResult[]> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params: params.map(serializeParam) }),
    });
    const envelope = (await response.json()) as D1Envelope;
    if (!response.ok || !envelope.success) {
      const message = envelope.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ?? response.statusText;
      throw new Error(`D1 query failed: ${message}`);
    }
    return envelope.result ?? [];
  }

  async run(sql: string, params: SqlParams = []): Promise<RunResult> {
    const [result] = await this.query(sql, params);
    return {
      changes: result?.meta?.changes ?? result?.meta?.rows_written ?? 0,
      lastInsertRowid: result?.meta?.last_row_id,
    };
  }

  async all<T extends object = Row>(sql: string, params: SqlParams = []): Promise<T[]> {
    const [result] = await this.query(sql, params);
    return (result?.results ?? []) as T[];
  }

  async get<T extends object = Row>(sql: string, params: SqlParams = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }

  async exec(script: string): Promise<void> {
    // D1 accepts several statements separated by semicolons in one call.
    await this.query(script);
  }

  async batch(statements: Array<{ sql: string; params?: SqlParams }>): Promise<void> {
    // The REST endpoint takes one parameterised statement per call; D1 runs
    // each call atomically. We serialise the calls to keep ordering.
    for (const statement of statements) {
      await this.query(statement.sql, statement.params ?? []);
    }
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}

function serializeParam(value: SqlParams[number]) {
  if (value instanceof Uint8Array) return Array.from(value);
  return value;
}
