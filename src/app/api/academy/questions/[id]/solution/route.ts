import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { errorResponse, json } from "@/academy/http";
import { LearningService } from "@/academy/services/learning";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    return json(await new LearningService(await getDb()).getSolution(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}
