import { requireApiUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { getLlm } from "@/academy/ai/client";
import { TutorService } from "@/academy/ai/tutor";
import { parseJson } from "@/academy/lib/json";

/** Tutor history for a lesson (and optionally a question). */
export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(request.url);
    const lessonId = url.searchParams.get("lessonId") ?? "";
    const questionId = url.searchParams.get("questionId");
    const db = await getDb();
    const tutor = new TutorService(db, { model: "", structured: async () => { throw new Error("unused"); }, streamTurn: async () => { throw new Error("unused"); } });
    await tutor.loadContext(user, lessonId, questionId);
    const thread = await tutor.getThread(user, lessonId, questionId);
    return json({ messages: parseJson(thread?.messages_json, []) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Streams the tutor's Hebrew answer as plain text chunks. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await readJson<{ lessonId?: string; questionId?: string | null; message?: string }>(request);
    const db = await getDb();
    const tutor = new TutorService(db, getLlm());
    await tutor.loadContext(user, String(body.lessonId ?? ""), body.questionId ?? null);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await tutor.ask(user, { lessonId: String(body.lessonId), questionId: body.questionId ?? null, message: String(body.message ?? "") }, (delta) =>
            controller.enqueue(encoder.encode(delta)),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "שגיאה";
          controller.enqueue(encoder.encode(`\n\n[שגיאה: ${message}]`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (error) {
    return errorResponse(error);
  }
}
