import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { AssignmentService } from "@/academy/services/assignments";

/** Saves one answer immediately (autosave). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const body = await readJson<{ questionId?: string; chosenKey?: string | null; position?: number }>(request);
    const chosen = typeof body.chosenKey === "string" ? body.chosenKey : null;
    const result = await new AssignmentService(await getDb()).saveAnswer(user, id, String(body.questionId ?? ""), chosen, typeof body.position === "number" ? body.position : undefined);
    return json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
