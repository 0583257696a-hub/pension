import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { LearningService } from "@/academy/services/learning";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await readJson<{ assetId?: string; seconds?: number; completed?: boolean }>(request);
    await new LearningService(await getDb()).recordVideoProgress(user, String(body.assetId ?? ""), Number(body.seconds ?? 0), !!body.completed);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
