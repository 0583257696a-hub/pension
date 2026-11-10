import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { AssignmentService } from "@/academy/services/assignments";

/** The approved solution of one question. Opening it before submitting locks that answer (recorded). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const body = await readJson<{ questionId?: string }>(request);
    const solution = await new AssignmentService(await getDb()).viewSolution(user, id, String(body.questionId ?? ""));
    return json({ ok: true, solution });
  } catch (error) {
    return errorResponse(error);
  }
}
