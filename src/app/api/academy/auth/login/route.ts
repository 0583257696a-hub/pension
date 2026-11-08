import { currentUserAgent, getAuthService, setSessionCookie } from "@/academy/auth/session";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ email?: string; password?: string }>(request);
    const auth = await getAuthService();
    const session = await auth.login(body.email ?? "", body.password ?? "", await currentUserAgent());
    await setSessionCookie(session.token, session.expiresAt);
    return json({ ok: true, user: { id: session.user.id, role: session.user.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
