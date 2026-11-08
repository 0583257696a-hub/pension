import { createHash } from "node:crypto";
import type { SqlDb } from "../db/types";
import { addDays, newId, nowIso, randomToken } from "../lib/ids";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";
import { AuthError, type User, type UserRole } from "./types";

const USER_COLUMNS = "id, email, full_name, phone, role, status, created_at, last_login_at";

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface SessionResult {
  user: User;
  /** Raw token to place in the cookie. Only the hash is stored. */
  token: string;
  expiresAt: Date;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthService {
  constructor(private readonly db: SqlDb, private readonly sessionDays = 30, private readonly bootstrapAdminEmail = "") {}

  async register(input: RegisterInput): Promise<SessionResult> {
    const email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("כתובת אימייל לא תקינה", "invalid_email");
    const weakness = validatePasswordStrength(input.password);
    if (weakness) throw new AuthError(weakness, "weak_password");
    const existing = await this.db.get("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) throw new AuthError("קיים כבר משתמש עם כתובת זו", "exists");

    const isFirstUser = !(await this.db.get("SELECT id FROM users LIMIT 1"));
    const role: UserRole =
      isFirstUser || (this.bootstrapAdminEmail && normalizeEmail(this.bootstrapAdminEmail) === email) ? "admin" : "student";
    const id = newId("usr");
    await this.db.run(
      "INSERT INTO users (id, email, password_hash, full_name, phone, role, status) VALUES (?,?,?,?,?,?,'active')",
      [id, email, hashPassword(input.password), input.full_name.trim(), (input.phone ?? "").trim(), role],
    );
    return this.createSession(id);
  }

  async login(email: string, password: string, userAgent?: string): Promise<SessionResult> {
    const row = await this.db.get<{ id: string; password_hash: string; status: string }>(
      "SELECT id, password_hash, status FROM users WHERE email = ?",
      [normalizeEmail(email)],
    );
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new AuthError("אימייל או סיסמה שגויים", "invalid_credentials");
    }
    if (row.status === "blocked") throw new AuthError("החשבון חסום. פנה למנהל המערכת", "blocked");
    await this.db.run("UPDATE users SET last_login_at = ? WHERE id = ?", [nowIso(), row.id]);
    return this.createSession(row.id, userAgent);
  }

  async createSession(userId: string, userAgent?: string): Promise<SessionResult> {
    const token = randomToken(32);
    const expiresAt = addDays(new Date(), this.sessionDays);
    await this.db.run("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?,?,?,?)", [
      hashToken(token),
      userId,
      expiresAt.toISOString(),
      userAgent ?? null,
    ]);
    const user = await this.getUserById(userId);
    if (!user) throw new AuthError("משתמש לא נמצא", "unauthenticated");
    return { user, token, expiresAt };
  }

  async getUserBySessionToken(token: string | undefined | null): Promise<User | null> {
    if (!token) return null;
    const row = await this.db.get<User & { expires_at: string }>(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at, u.last_login_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
      [hashToken(token)],
    );
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await this.db.run("DELETE FROM sessions WHERE id = ?", [hashToken(token)]);
      return null;
    }
    if (row.status === "blocked") return null;
    const { expires_at: _ignored, ...user } = row;
    void _ignored;
    return user;
  }

  async logout(token: string | undefined | null): Promise<void> {
    if (!token) return;
    await this.db.run("DELETE FROM sessions WHERE id = ?", [hashToken(token)]);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.db.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  }

  async listUsers(): Promise<User[]> {
    return this.db.all<User>(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC`);
  }

  async setRole(userId: string, role: UserRole): Promise<void> {
    await this.db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  }

  async setStatus(userId: string, status: "active" | "blocked"): Promise<void> {
    await this.db.run("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
    if (status === "blocked") await this.db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  }

  async changePassword(userId: string, newPassword: string): Promise<void> {
    const weakness = validatePasswordStrength(newPassword);
    if (weakness) throw new AuthError(weakness, "weak_password");
    await this.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(newPassword), userId]);
  }
}

export function isStaff(user: User | null | undefined): boolean {
  return !!user && (user.role === "admin" || user.role === "reviewer");
}

export function isAdmin(user: User | null | undefined): boolean {
  return !!user && user.role === "admin";
}
