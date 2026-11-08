import { cookies } from "next/headers";
import { clearSessionCookie, getAuthService, SESSION_COOKIE } from "@/academy/auth/session";
import { assertSameOrigin, errorResponse, json } from "@/academy/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    await (await getAuthService()).logout(token);
    await clearSessionCookie();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
