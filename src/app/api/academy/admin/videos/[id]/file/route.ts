import { requireApiStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json } from "@/academy/http";
import { VideoStudioService } from "@/academy/services/video-studio";
import { MAX_VIDEO_BYTES } from "@/academy/storage/video-checks";

/** Server-side upload target, used when storage has no presigned upload URL (local development). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireApiStaff();
    const { id } = await params;
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_VIDEO_BYTES) return json({ error: "הקובץ גדול מדי" }, 413);
    const data = new Uint8Array(await request.arrayBuffer());
    await new VideoStudioService(await getDb()).storeUploadedBytes(id, data);
    return json({ ok: true, size: data.byteLength });
  } catch (error) {
    return errorResponse(error);
  }
}
