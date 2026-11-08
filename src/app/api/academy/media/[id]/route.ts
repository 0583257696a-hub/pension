import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
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

    const storage = getStorage();
    const signed = await storage.presignedDownload(asset.storage_key, 900);
    if (signed) return Response.redirect(signed, 302);

    const file = storage.localPath(asset.storage_key);
    if (!file) return json({ error: "לא נמצא" }, 404);
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      return json({ error: "הקובץ לא נמצא" }, 404);
    }
    const range = request.headers.get("range");
    const headers: Record<string, string> = {
      "content-type": asset.content_type || "video/mp4",
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
    };
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
      return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
    }
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(stream, { status: 200, headers: { ...headers, "content-length": String(size) } });
  } catch (error) {
    return errorResponse(error);
  }
}
