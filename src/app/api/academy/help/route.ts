import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { HelpService } from "@/academy/services/help";

/** "צריכים עזרה?" — the question context is attached on the server from the attempt. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await readJson<{ attemptId?: string; questionId?: string; message?: string }>(request);
    const result = await new HelpService(await getDb()).create(user, {
      attemptId: String(body.attemptId ?? ""), questionId: String(body.questionId ?? ""), message: String(body.message ?? ""),
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
