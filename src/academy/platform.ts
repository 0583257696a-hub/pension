/**
 * Access to Cloudflare bindings when the app runs on Cloudflare Workers
 * (OpenNext adapter). Returns null everywhere else (Node hosts, `next start`,
 * tests), so the same code falls back to SQLite / local disk.
 *
 * The runtime check matters: outside Workers, OpenNext's async context call
 * starts a local Cloudflare emulator from wrangler.jsonc, which would silently
 * replace the configured database with an emulated one.
 */
export interface CloudflareBindings {
  ACADEMY_DB?: unknown;
  ACADEMY_MEDIA?: unknown;
  [key: string]: unknown;
}

export function isCloudflareWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

export async function cloudflareEnv(): Promise<CloudflareBindings | null> {
  if (!isCloudflareWorkers()) return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = getCloudflareContext();
    return (context?.env as CloudflareBindings) ?? null;
  } catch {
    return null;
  }
}
