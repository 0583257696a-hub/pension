/**
 * Password hashing with PBKDF2-SHA256 through Web Crypto, which runs natively
 * on Node and on Cloudflare Workers (Workers cap PBKDF2 at 100,000 iterations).
 * Stored format: "pbkdf2" + iterations + salt (base64url) + hash (base64url), joined with "$".
 */
const ITERATIONS = 100_000;
const KEY_BITS = 256;

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function derive(password: string, salt: Uint8Array, iterations: number, bits: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, bits);
  return new Uint8Array(derived);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS, KEY_BITS);
  return ["pbkdf2", String(ITERATIONS), b64url(salt), b64url(hash)].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const salt = new Uint8Array(Buffer.from(parts[2], "base64url"));
  const expected = new Uint8Array(Buffer.from(parts[3], "base64url"));
  const actual = await derive(password, salt, iterations, expected.length * 8);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) return "הסיסמה חייבת לכלול אותיות וספרות";
  return null;
}
