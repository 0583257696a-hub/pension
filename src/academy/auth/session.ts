import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "../config";
import { getDb } from "../db";
import { AuthService, isAdmin, isStaff } from "./service";
import { AuthError, type User } from "./types";

export const SESSION_COOKIE = "academy_session";

export async function getAuthService(): Promise<AuthService> {
  const config = getConfig();
  return new AuthService(await getDb(), config.auth.sessionDays, config.auth.bootstrapAdminEmail);
}

/** Current user from the session cookie, or null. Safe in Server Components. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const auth = await getAuthService();
  return auth.getUserBySessionToken(token);
}

export async function requireUser(returnTo?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    const target = returnTo ? `/academy/login?next=${encodeURIComponent(returnTo)}` : "/academy/login";
    redirect(target);
  }
  return user;
}

export async function requireStaff(): Promise<User> {
  const user = await requireUser("/academy/admin");
  if (!isStaff(user)) redirect("/academy/dashboard?forbidden=1");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser("/academy/admin");
  if (!isAdmin(user)) redirect("/academy/dashboard?forbidden=1");
  return user;
}

/** For route handlers: returns the user or throws AuthError (map to 401/403). */
export async function requireApiUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("נדרשת התחברות", "unauthenticated");
  return user;
}

export async function requireApiStaff(): Promise<User> {
  const user = await requireApiUser();
  if (!isStaff(user)) throw new AuthError("אין הרשאה", "forbidden");
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().auth.secureCookies,
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: getConfig().auth.secureCookies, expires: new Date(0), path: "/" });
}

export async function currentUserAgent(): Promise<string | undefined> {
  const h = await headers();
  return h.get("user-agent") ?? undefined;
}
