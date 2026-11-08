import { AuthError } from "./auth/types";
import { AccessDeniedError } from "./services/learning";
import { ReviewGateError } from "./services/content-admin";
import { StudioError } from "./services/video-studio";
import { PaymentsNotConfiguredError } from "./billing/payment-provider";
import { LlmNotConfiguredError, LlmRefusalError } from "./ai/client";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AuthError) return json({ error: error.message, code: error.code }, error.code === "forbidden" ? 403 : error.code === "unauthenticated" ? 401 : 400);
  if (error instanceof AccessDeniedError) return json({ error: error.message, code: error.reason }, error.reason === "login_required" ? 401 : error.reason === "not_found" ? 404 : 403);
  if (error instanceof ReviewGateError || error instanceof StudioError) return json({ error: error.message }, 400);
  if (error instanceof PaymentsNotConfiguredError) return json({ error: error.message, code: "payments_not_configured" }, 409);
  if (error instanceof LlmNotConfiguredError) return json({ error: error.message, code: "llm_not_configured" }, 503);
  if (error instanceof LlmRefusalError) return json({ error: error.message, code: "refusal" }, 422);
  if (error instanceof SyntaxError) return json({ error: "בקשה לא תקינה" }, 400);
  console.error("[academy]", error);
  const message = error instanceof Error ? error.message : "שגיאה לא צפויה";
  return json({ error: message }, 500);
}

/** Defence in depth on top of SameSite=Lax cookies: state-changing requests must come from our own origin. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return; // same-origin fetches from older browsers / server-side calls
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthError("מקור בקשה לא תקין", "forbidden");
  }
  if (host && originHost !== host) throw new AuthError("מקור בקשה לא תקין", "forbidden");
}

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (text.length > 1_000_000) throw new SyntaxError("payload too large");
  return (text ? JSON.parse(text) : {}) as T;
}
