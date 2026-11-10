import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { AssignmentService } from "@/academy/services/assignments";

/** Opens (or resumes) the student's attempt. `newAttempt` starts a practice attempt after the official one was submitted. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const body = await readJson<{ newAttempt?: boolean }>(request);
    const attemptId = await new AssignmentService(await getDb()).startOrResume(user, id, { newAttempt: !!body.newAttempt });
    return json({ ok: true, attemptId });
  } catch (error) {
    return errorResponse(error);
  }
}
