/**
 * NotebookProvider: the only place that talks to NotebookLM.
 *
 * Implemented operations are limited to the officially documented
 * Gemini Notebook Enterprise (formerly NotebookLM Enterprise) REST API, v1alpha,
 * served by Discovery Engine:
 *
 *   POST {base}/notebooks                                  notebooks.create   body {"title"}
 *   GET  {base}/notebooks/{notebookId}                     notebooks.get
 *   POST {base}/notebooks/{notebookId}/sources:batchCreate sources.batchCreate body {"userContents":[...]}
 *   POST {upload}/notebooks/{notebookId}/sources:uploadFile sources.uploadFile (raw bytes)
 *   GET  {base}/notebooks/{notebookId}/sources/{sourceId}  sources.get
 *
 *   base   = https://{ENDPOINT_LOCATION}discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}
 *   upload = same host, /upload/v1alpha/...
 *
 * The API is v1alpha (pre-GA) and needs an OAuth access token of a user with a
 * Gemini Notebook Enterprise license. There is NO documented API for creating
 * or downloading Video Overviews, so this provider never tries to: videos are
 * produced manually in the NotebookLM UI (see VideoProvider / Video Studio).
 * Deleting notebooks (notebooks.batchDelete) is intentionally not implemented.
 */
export interface NotebookSourceInput {
  title: string;
  kind: "text" | "web";
  content?: string; // for text
  url?: string; // for web
}

export interface CreatedNotebook {
  externalName: string; // projects/.../notebooks/{id}
  externalId: string;
  url: string | null;
}

export interface CreatedSource {
  externalName: string | null;
  externalId: string | null;
  title: string;
  status: SourceStatus;
  statusRaw: string | null;
}

export type SourceStatus = "processing" | "ready" | "error" | "unknown";

export interface NotebookProvider {
  readonly name: string;
  /** False when the provider only prepares files for a manual upload in the NotebookLM UI. */
  readonly automatic: boolean;
  createNotebook(title: string): Promise<CreatedNotebook>;
  addSources(notebookExternalId: string, sources: NotebookSourceInput[]): Promise<CreatedSource[]>;
  uploadFile(notebookExternalId: string, fileName: string, contentType: string, data: Uint8Array): Promise<CreatedSource>;
  getSourceStatus(notebookExternalId: string, sourceExternalId: string): Promise<{ status: SourceStatus; statusRaw: string | null }>;
  notebookUrl(externalId: string): string | null;
}

export interface AccessTokenProvider {
  getToken(): Promise<string>;
}

/** Static token (e.g. from `gcloud auth print-access-token`), for development. */
export class StaticTokenProvider implements AccessTokenProvider {
  constructor(private readonly token: string) {}
  async getToken() {
    return this.token;
  }
}

/** Standard Google OAuth 2.0 refresh-token flow, for long-running servers. */
export class RefreshTokenProvider implements AccessTokenProvider {
  private cached: { token: string; expiresAt: number } | null = null;
  constructor(
    private readonly cfg: { clientId: string; clientSecret: string; refreshToken: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async getToken() {
    if (this.cached && this.cached.expiresAt - 60_000 > Date.now()) return this.cached.token;
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        refresh_token: this.cfg.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const body = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !body.access_token) throw new Error(`Google OAuth token refresh failed: ${body.error ?? response.status}`);
    this.cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }
}

export function mapSourceStatus(raw: string | null | undefined): SourceStatus {
  if (!raw) return "unknown";
  const value = raw.toUpperCase();
  if (/(COMPLETE|READY|SUCCEEDED|ACTIVE)/.test(value)) return "ready";
  if (/(ERROR|FAIL)/.test(value)) return "error";
  if (/(PENDING|PROCESSING|RUNNING|IN_PROGRESS|UPLOADING)/.test(value)) return "processing";
  return "unknown";
}

interface SourceResource {
  name?: string;
  title?: string;
  sourceId?: { id?: string } | string;
  settings?: { status?: string };
  metadata?: Record<string, unknown>;
}

export interface NotebookLmEnterpriseConfig {
  projectNumber: string;
  location: string; // "global" | "us" | "eu"
  /** Host prefix, e.g. "global-", "us-", "eu-"; or a full host such as discoveryengine.us.rep.googleapis.com */
  endpointLocation?: string;
  tokens: AccessTokenProvider;
  /** UI link template; placeholders {location}, {notebookId}, {projectNumber}. Admins can always paste the real link. */
  webUrlTemplate?: string;
  fetchImpl?: typeof fetch;
}

export class NotebookLmEnterpriseProvider implements NotebookProvider {
  readonly name = "notebooklm_enterprise";
  readonly automatic = true;
  private readonly host: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: NotebookLmEnterpriseConfig) {
    const prefix = cfg.endpointLocation ?? (cfg.location === "global" ? "global-" : `${cfg.location}-`);
    this.host = prefix.includes(".") ? prefix : `${prefix}discoveryengine.googleapis.com`;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private parent(): string {
    return `projects/${this.cfg.projectNumber}/locations/${this.cfg.location}`;
  }

  private async call<T>(method: "GET" | "POST", url: string, body?: unknown, extraHeaders: Record<string, string> = {}, rawBody?: Uint8Array): Promise<T> {
    const token = await this.cfg.tokens.getToken();
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(rawBody ? {} : { "Content-Type": "application/json" }),
        ...extraHeaders,
      },
      body: rawBody ? Buffer.from(rawBody) : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as T & { error?: { message?: string; status?: string } }) : ({} as T & { error?: { message?: string } });
    if (!response.ok) {
      throw new Error(`NotebookLM API ${response.status}: ${json.error?.message ?? text.slice(0, 300)}`);
    }
    return json;
  }

  async createNotebook(title: string): Promise<CreatedNotebook> {
    const result = await this.call<{ name?: string; notebookId?: string }>(
      "POST",
      `https://${this.host}/v1alpha/${this.parent()}/notebooks`,
      { title },
    );
    const externalId = result.notebookId ?? result.name?.split("/").pop();
    if (!externalId) throw new Error("NotebookLM API did not return a notebook id");
    return { externalName: result.name ?? `${this.parent()}/notebooks/${externalId}`, externalId, url: this.notebookUrl(externalId) };
  }

  async addSources(notebookId: string, sources: NotebookSourceInput[]): Promise<CreatedSource[]> {
    const userContents = sources.map((s) =>
      s.kind === "web"
        ? { webContent: { url: s.url, sourceName: s.title } }
        : { textContent: { sourceName: s.title, content: s.content ?? "" } },
    );
    const result = await this.call<{ sources?: SourceResource[] }>(
      "POST",
      `https://${this.host}/v1alpha/${this.parent()}/notebooks/${notebookId}/sources:batchCreate`,
      { userContents },
    );
    return (result.sources ?? []).map((s, i) => this.toCreated(s, sources[i]?.title ?? ""));
  }

  async uploadFile(notebookId: string, fileName: string, contentType: string, data: Uint8Array): Promise<CreatedSource> {
    const result = await this.call<SourceResource>(
      "POST",
      `https://${this.host}/upload/v1alpha/${this.parent()}/notebooks/${notebookId}/sources:uploadFile`,
      undefined,
      { "X-Goog-Upload-File-Name": fileName, "X-Goog-Upload-Protocol": "raw", "Content-Type": contentType },
      data,
    );
    return this.toCreated(result, fileName);
  }

  async getSourceStatus(notebookId: string, sourceId: string) {
    const result = await this.call<SourceResource>("GET", `https://${this.host}/v1alpha/${this.parent()}/notebooks/${notebookId}/sources/${sourceId}`);
    const raw = result.settings?.status ?? null;
    return { status: mapSourceStatus(raw), statusRaw: raw };
  }

  notebookUrl(externalId: string): string | null {
    const template = this.cfg.webUrlTemplate;
    if (!template) return null;
    return template
      .replace("{location}", this.cfg.location)
      .replace("{notebookId}", externalId)
      .replace("{projectNumber}", this.cfg.projectNumber);
  }

  private toCreated(s: SourceResource, fallbackTitle: string): CreatedSource {
    const id = typeof s.sourceId === "string" ? s.sourceId : s.sourceId?.id ?? s.name?.split("/").pop() ?? null;
    const raw = s.settings?.status ?? null;
    return { externalName: s.name ?? null, externalId: id, title: s.title ?? fallbackTitle, status: raw ? mapSourceStatus(raw) : "processing", statusRaw: raw };
  }
}

/**
 * Manual provider: used when no Enterprise API access is configured. The
 * system still prepares the notebook plan and the source documents; the admin
 * creates the notebook in the NotebookLM UI, uploads the documents, and pastes
 * the notebook link back into Video Studio.
 */
export class ManualNotebookProvider implements NotebookProvider {
  readonly name = "manual";
  readonly automatic = false;
  async createNotebook(): Promise<CreatedNotebook> {
    throw new Error("manual provider: create the notebook in the NotebookLM UI");
  }
  async addSources(): Promise<CreatedSource[]> {
    throw new Error("manual provider: upload the source documents in the NotebookLM UI");
  }
  async uploadFile(): Promise<CreatedSource> {
    throw new Error("manual provider");
  }
  async getSourceStatus() {
    return { status: "unknown" as const, statusRaw: null };
  }
  notebookUrl() {
    return null;
  }
}

export function getNotebookProvider(): NotebookProvider {
  const projectNumber = process.env.NOTEBOOKLM_PROJECT_NUMBER;
  if (!projectNumber) return new ManualNotebookProvider();
  const location = process.env.NOTEBOOKLM_LOCATION ?? "global";
  let tokens: AccessTokenProvider;
  if (process.env.NOTEBOOKLM_OAUTH_REFRESH_TOKEN) {
    tokens = new RefreshTokenProvider({
      clientId: process.env.NOTEBOOKLM_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.NOTEBOOKLM_OAUTH_CLIENT_SECRET ?? "",
      refreshToken: process.env.NOTEBOOKLM_OAUTH_REFRESH_TOKEN,
    });
  } else if (process.env.NOTEBOOKLM_ACCESS_TOKEN) {
    tokens = new StaticTokenProvider(process.env.NOTEBOOKLM_ACCESS_TOKEN);
  } else {
    return new ManualNotebookProvider();
  }
  return new NotebookLmEnterpriseProvider({
    projectNumber,
    location,
    endpointLocation: process.env.NOTEBOOKLM_ENDPOINT_LOCATION || undefined,
    tokens,
    webUrlTemplate: process.env.NOTEBOOKLM_WEB_URL_TEMPLATE || undefined,
  });
}
