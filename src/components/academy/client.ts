"use client";

/** Small fetch helper for academy client components. */
export async function api<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `שגיאה (${response.status})`);
  return data;
}

export const adminAction = <T = unknown>(action: string, payload: Record<string, unknown> = {}) =>
  api<T>("/api/academy/admin/actions", { action, ...payload });
