import { getCurrentUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { newId } from "@/academy/lib/ids";

/** Public contact form. Stored for the team; rate-limited per email. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ name?: string; email?: string; phone?: string; subject?: string; message?: string; website?: string }>(request);
    if (body.website) return json({ ok: true }); // honeypot
    const name = String(body.name ?? "").trim().slice(0, 120);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
    const message = String(body.message ?? "").trim().slice(0, 4000);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) return json({ error: "נא למלא שם, אימייל תקין והודעה" }, 400);
    const db = await getDb();
    const recent = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM contact_messages WHERE email = ? AND created_at > ?", [email, new Date(Date.now() - 3600_000).toISOString()]);
    if (Number(recent?.n ?? 0) >= 5) return json({ error: "נשלחו הרבה הודעות. נסו שוב מאוחר יותר." }, 429);
    const user = await getCurrentUser();
    await db.run("INSERT INTO contact_messages (id, user_id, name, email, phone, subject, message) VALUES (?,?,?,?,?,?,?)", [
      newId("msg"), user?.id ?? null, name, email, String(body.phone ?? "").trim().slice(0, 40), String(body.subject ?? "").trim().slice(0, 200), message,
    ]);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
