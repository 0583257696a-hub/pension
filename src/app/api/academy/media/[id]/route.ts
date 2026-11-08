import { getCurrentUser } from "@/academy/auth/session";
import { isStaff } from "@/academy/auth/service";
import { getDb } from "@/academy/db";
import { errorResponse, json } from "@/academy/http";
import { getStorage } from "@/academy/storage";
import { decideLessonAccess, EntitlementService } from "@/academy/billing/entitlements";
import type { LessonRow, QuestionRow, UnitRow } from "@/academy/services/types";

/**
 * Serves a video only to users entitled to its lesson. Staff may preview any
 * version (Video Studio). Supports HTTP Range for seeking.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return json({ error: "נדרשת התחברות" }, 401);
    const db = await getDb();
    const asset = await db.get<{ id: string; target_type: string; target_id: string; status: string; storage_key: string; content_type: string }>(
      "SELECT id, target_type, target_id, status, storage_key, content_type FROM video_assets WHERE id = ?",
      [id],
    );
    if (!asset) return json({ error: "לא נמצא" }, 404);
    if (!isStaff(user)) {
      if (asset.status !== "published") return json({ error: "לא נמצא" }, 404);
      const lessonId =
        asset.target_type === "lesson"
          ? asset.target_id
          : (await db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [asset.target_id]))?.lesson_id;
      // A published question video can also be linked to other questions; access follows the original question's lesson.
      const lesson = lessonId ? await db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [lessonId]) : null;
      if (!lesson) return json({ error: "לא נמצא" }, 404);
      const unit = await db.get<UnitRow>("SELECT * FROM units WHERE id = ?", [lesson.unit_id]);
      const entitlement = await new EntitlementService(db).getEntitlement(user, unit!.course_id);
      if (!decideLessonAccess(user, lesson, entitlement).allowed) return json({ error: "התוכן זמין למנויים" }, 403);
    }

    const storage = await getStorage();
    const signed = await storage.presignedDownload(asset.storage_key, 900);
    if (signed) return Response.redirect(signed, 302);

    const headers: Record<string, string> = {
      "content-type": asset.content_type || "video/mp4",
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
    };
    const rangeHeader = request.headers.get("range");
    const match = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;
    const range = match ? { start: match[1] ? Number(match[1]) : 0, end: match[2] ? Number(match[2]) : undefined } : undefined;
    const object = await storage.stream(asset.storage_key, range);
    if (!object) return json({ error: "הקובץ לא נמצא" }, 404);
    if (range && (object.start >= object.size || object.start > object.end)) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${object.size}` } });
    }
    if (object.partial) {
      return new Response(object.body, {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${object.start}-${object.end}/${object.size}`, "content-length": String(object.end - object.start + 1) },
      });
    }
    return new Response(object.body, { status: 200, headers: { ...headers, "content-length": String(object.size) } });
  } catch (error) {
    return errorResponse(error);
  }
}
