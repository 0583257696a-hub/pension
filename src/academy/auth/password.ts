import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with PBKDF2-SHA256. Portable (Node and Workers' node:crypto
 * compat) and dependency-free. Format: pbkdf2$<iterations>$<salt>$<hash>
 */
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password.normalize("NFKC"), salt, ITERATIONS, KEY_LENGTH, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], "base64url");
  const expected = Buffer.from(parts[3], "base64url");
  const actual = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, expected.length, "sha256");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) return "הסיסמה חייבת לכלול אותיות וספרות";
  return null;
}
