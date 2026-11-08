/**
 * Access to Cloudflare bindings when the app runs on Cloudflare Workers
 * (OpenNext adapter). Returns null everywhere else (Node, tests), so the
 * same code falls back to SQLite / local disk.
 */
export interface CloudflareBindings {
  ACADEMY_DB?: unknown;
  ACADEMY_MEDIA?: unknown;
  [key: string]: unknown;
}

export async function cloudflareEnv(): Promise<CloudflareBindings | null> {
  if (process.env.VITEST) return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context?.env as CloudflareBindings) ?? null;
  } catch {
    return null;
  }
}
