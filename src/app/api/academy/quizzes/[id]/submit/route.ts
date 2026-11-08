import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { LearningService } from "@/academy/services/learning";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const body = await readJson<{ answers?: Record<string, string>; startedAt?: string }>(request);
    const result = await new LearningService(await getDb()).submitQuiz(user, id, body.answers ?? {}, body.startedAt);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
