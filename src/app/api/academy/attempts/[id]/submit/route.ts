import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json } from "@/academy/http";
import { AssignmentService } from "@/academy/services/assignments";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const results = await new AssignmentService(await getDb()).submit(user, id);
    return json({ ok: true, summary: results.summary });
  } catch (error) {
    return errorResponse(error);
  }
}
