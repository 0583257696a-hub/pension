import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { AssignmentService } from "@/academy/services/assignments";

/** Remembers the question the student is on, so they return to it later. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const body = await readJson<{ position?: number }>(request);
    await new AssignmentService(await getDb()).setPosition(user, id, Number(body.position ?? 1));
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
