/**
 * Central place for the academy's environment configuration.
 * Everything is optional in development; production deployments set the
 * variables they need (see ACADEMY.md).
 */
export type DbDriver = "sqlite" | "d1-http" | "d1-binding";
export type StorageDriver = "local" | "r2";

export interface AcademyConfig {
  db: {
    driver: DbDriver;
    sqliteFile: string;
    d1: { accountId: string; databaseId: string; apiToken: string };
  };
  storage: {
    driver: StorageDriver;
    localDir: string;
    r2: { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string; publicBaseUrl?: string };
  };
  anthropic: { apiKey: string; model: string; tutorEffort: "low" | "medium" | "high" };
  notebook: {
    enabled: boolean;
    projectNumber: string;
    location: string;
    endpointLocation: string;
    accessToken: string;
    webBaseUrl: string;
  };
  payments: { provider: string };
  auth: { sessionDays: number; secureCookies: boolean; bootstrapAdminEmail: string };
  appUrl: string;
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function getConfig(): AcademyConfig {
  const isProd = process.env.NODE_ENV === "production";
  const dbDriver = (env("ACADEMY_DB_DRIVER") || (env("CF_D1_DATABASE_ID") ? "d1-http" : "sqlite")) as DbDriver;
  const storageDriver = (env("ACADEMY_STORAGE_DRIVER") || (env("R2_BUCKET") ? "r2" : "local")) as StorageDriver;
  return {
    db: {
      driver: dbDriver,
      sqliteFile: env("ACADEMY_SQLITE_FILE", ".data/academy.sqlite"),
      d1: {
        accountId: env("CF_ACCOUNT_ID"),
        databaseId: env("CF_D1_DATABASE_ID"),
        apiToken: env("CF_API_TOKEN"),
      },
    },
    storage: {
      driver: storageDriver,
      localDir: env("ACADEMY_UPLOAD_DIR", ".data/uploads"),
      r2: {
        accountId: env("CF_ACCOUNT_ID"),
        bucket: env("R2_BUCKET"),
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
        publicBaseUrl: env("R2_PUBLIC_BASE_URL") || undefined,
      },
    },
    anthropic: {
      apiKey: env("ANTHROPIC_API_KEY"),
      model: env("ACADEMY_CLAUDE_MODEL", "claude-opus-5-5"),
      tutorEffort: (env("ACADEMY_TUTOR_EFFORT", "medium") as "low" | "medium" | "high"),
    },
    notebook: {
      enabled: Boolean(env("NOTEBOOKLM_PROJECT_NUMBER")),
      projectNumber: env("NOTEBOOKLM_PROJECT_NUMBER"),
      location: env("NOTEBOOKLM_LOCATION", "global"),
      endpointLocation: env("NOTEBOOKLM_ENDPOINT_LOCATION", ""),
      accessToken: env("NOTEBOOKLM_ACCESS_TOKEN"),
      webBaseUrl: env("NOTEBOOKLM_WEB_BASE_URL", "https://notebooklm.google.com"),
    },
    payments: { provider: env("ACADEMY_PAYMENT_PROVIDER", "none") },
    auth: {
      sessionDays: Number(env("ACADEMY_SESSION_DAYS", "30")),
      secureCookies: isProd,
      bootstrapAdminEmail: env("ACADEMY_BOOTSTRAP_ADMIN_EMAIL", ""),
    },
    appUrl: env("ACADEMY_APP_URL", "http://localhost:3000"),
  };
}
