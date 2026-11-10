import { getCurrentUser } from "@/academy/auth/session";
import { isStaff } from "@/academy/auth/service";
import { decideLessonAccess, EntitlementService } from "@/academy/billing/entitlements";
import { getDb } from "@/academy/db";
import { errorResponse, json } from "@/academy/http";
import { MaterialsService } from "@/academy/services/materials";
import type { LessonRow, UnitRow } from "@/academy/services/types";
import { getStorage } from "@/academy/storage";

/**
 * Lesson PDFs, served only to users entitled to the lesson (drafts: staff only).
 * `?download=1` saves the file; otherwise it opens in the browser's PDF viewer (view and print).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return json({ error: "נדרשת התחברות" }, 401);
    const db = await getDb();
    const asset = await new MaterialsService(db).get(id);
    if (!asset) return json({ error: "לא נמצא" }, 404);
    if (!isStaff(user)) {
      if (asset.status !== "published") return json({ error: "לא נמצא" }, 404);
      const lesson = await db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [asset.lesson_id]);
      const unit = lesson ? await db.get<UnitRow>("SELECT * FROM units WHERE id = ?", [lesson.unit_id]) : null;
      if (!lesson || !unit) return json({ error: "לא נמצא" }, 404);
      const entitlement = await new EntitlementService(db).getEntitlement(user, unit.course_id);
      if (!decideLessonAccess(user, lesson, entitlement).allowed) return json({ error: "הקובץ זמין לתלמידים שרכשו את הקורס" }, 403);
    }
    const object = await (await getStorage()).stream(asset.storage_key);
    if (!object) return json({ error: "הקובץ לא נמצא" }, 404);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const filename = `${asset.title}.pdf`;
    return new Response(object.body, {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(object.size),
        "content-disposition": `${download ? "attachment" : "inline"}; filename="lesson-${asset.kind}-v${asset.version}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
