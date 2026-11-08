import { requireApiStaff } from "@/academy/auth/session";
import { AuthService, isAdmin } from "@/academy/auth/service";
import { AuthError, type UserRole } from "@/academy/auth/types";
import { EntitlementService } from "@/academy/billing/entitlements";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { getLlm } from "@/academy/ai/client";
import { addMaterial, ContentEngine } from "@/academy/ai/content-engine";
import { seedCourse } from "@/academy/content/seed";
import { financeStatisticsCourse } from "@/academy/content/course";
import { ContentAdminService } from "@/academy/services/content-admin";
import { reviewFact } from "@/academy/services/facts";
import { VideoStudioService } from "@/academy/services/video-studio";
import { LearningService } from "@/academy/services/learning";

type Body = Record<string, unknown> & { action?: string };

const ADMIN_ONLY = new Set([
  "lesson.status", "lesson.access", "content.import", "material.add", "ai.syllabus", "ai.lessonPlan", "ai.questions", "ai.apply",
  "video.publish", "video.unpublish", "video.link", "user.role", "user.status", "sub.grant", "sub.revoke",
]);

const s = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiStaff();
    const body = await readJson<Body>(request);
    const action = s(body.action);
    if (ADMIN_ONLY.has(action) && !isAdmin(user)) throw new AuthError("פעולה זו מותרת למנהלים בלבד", "forbidden");
    const db = await getDb();
    const course = await new LearningService(db).getCourse();
    const model = course?.calculator_model ?? "casio-fc-200v";
    const content = new ContentAdminService(db);
    const studio = new VideoStudioService(db);

    switch (action) {
      case "fact.review":
        await reviewFact(db, model, s(body.factKey), body.status === "rejected" ? "rejected" : "confirmed", s(body.manualRef), s(body.note), user.id);
        return json({ ok: true });
      case "question.review":
        await content.reviewQuestion(user, s(body.questionId), (s(body.decision) || "approve") as "approve" | "reject" | "request_changes", s(body.note));
        return json({ ok: true });
      case "question.reverify":
        return json({ ok: true, report: await content.reverifyQuestion(s(body.questionId), model) });
      case "lesson.status":
        await content.setLessonStatus(user, s(body.lessonId), body.decision === "unpublish" ? "unpublish" : "publish");
        return json({ ok: true });
      case "lesson.access":
        await content.setLessonAccess(user, s(body.lessonId), body.access === "free" ? "free" : "paid");
        return json({ ok: true });
      case "content.import":
        return json({ ok: true, summary: await seedCourse(db, financeStatisticsCourse, user.id) });
      case "material.add":
        return json({ ok: true, id: await addMaterial(db, user, course!.id, (s(body.kind) || "source") as "syllabus", s(body.title), s(body.text)) });
      case "ai.syllabus":
        return json({ ok: true, ...(await new ContentEngine(db, getLlm()).splitSyllabus(user, course!.id)) });
      case "ai.lessonPlan":
        return json({ ok: true, ...(await new ContentEngine(db, getLlm()).lessonPlan(user, s(body.lessonId))) });
      case "ai.questions":
        return json({
          ok: true,
          ...(await new ContentEngine(db, getLlm()).questions(user, s(body.lessonId), Number(body.count ?? 4), Array.isArray(body.difficulties) ? (body.difficulties as number[]) : [1, 2, 3])),
        });
      case "ai.apply":
        await new ContentEngine(db, getLlm()).apply(user, s(body.jobId));
        return json({ ok: true });
      case "studio.package":
        return json({ ok: true, ...(await studio.createPackage(user, body.targetType === "question" ? "question" : "lesson", s(body.targetId), body.useClaude ? getLlm() : undefined)) });
      case "studio.notebook":
        return json({ ok: true, ...(await studio.prepareNotebook(user, s(body.packageId))) });
      case "studio.notebookRefresh":
        return json({ ok: true, notebook: await studio.refreshNotebook(s(body.notebookId)) });
      case "studio.notebookLink":
        await studio.setNotebookUrl(user, s(body.notebookId), s(body.url));
        return json({ ok: true });
      case "video.init":
        return json({
          ok: true,
          ...(await studio.initUpload(user, {
            targetType: body.targetType === "question" ? "question" : "lesson",
            targetId: s(body.targetId), fileName: s(body.fileName), contentType: s(body.contentType), size: Number(body.size ?? 0), packageId: s(body.packageId) || null,
          })),
        });
      case "video.complete":
        return json({ ok: true, checks: await studio.completeUpload(user, s(body.assetId)) });
      case "video.review":
        {
          const checklist = (body.checklist as Record<string, boolean> | undefined) ??
            Object.fromEntries(Object.entries(body).filter(([k]) => k.startsWith("check_")).map(([k, v]) => [k.slice(6), v === true]));
          await studio.review(user, s(body.assetId), body.decision === "reject" ? "reject" : "approve", checklist, s(body.note));
        }
        return json({ ok: true });
      case "video.publish":
        await studio.publish(user, s(body.assetId));
        return json({ ok: true });
      case "video.unpublish":
        await studio.unpublish(user, s(body.assetId));
        return json({ ok: true });
      case "video.link":
        await studio.linkToQuestion(user, s(body.assetId), s(body.questionId));
        return json({ ok: true });
      case "user.role": {
        const role = s(body.role) as UserRole;
        if (!["student", "reviewer", "admin"].includes(role)) return json({ error: "תפקיד לא תקין" }, 400);
        if (s(body.userId) === user.id) return json({ error: "לא ניתן לשנות את התפקיד של עצמך" }, 400);
        await new AuthService(db).setRole(s(body.userId), role);
        return json({ ok: true });
      }
      case "user.status":
        if (s(body.userId) === user.id) return json({ error: "לא ניתן לחסום את עצמך" }, 400);
        await new AuthService(db).setStatus(s(body.userId), body.status === "blocked" ? "blocked" : "active");
        return json({ ok: true });
      case "sub.grant": {
        const until = new Date(s(body.until));
        if (Number.isNaN(until.getTime()) || until.getTime() < Date.now()) return json({ error: "תאריך סיום לא תקין" }, 400);
        if (!s(body.note).trim()) return json({ error: "יש לציין אסמכתא (למשל מספר חשבונית)" }, 400);
        await new EntitlementService(db).grantManual(s(body.userId), course!.id, until, s(body.note), user.id);
        return json({ ok: true });
      }
      case "sub.cancel":
        await new EntitlementService(db).cancel(s(body.subscriptionId), user.id);
        return json({ ok: true });
      case "sub.revoke":
        await new EntitlementService(db).revoke(s(body.subscriptionId), user.id, s(body.note) || "בוטל על ידי מנהל");
        return json({ ok: true });
      default:
        return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
