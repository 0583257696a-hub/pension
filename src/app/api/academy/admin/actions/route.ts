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
import { AssignmentService, type SolutionPolicy } from "@/academy/services/assignments";
import { MaterialsService } from "@/academy/services/materials";
import { BillingService } from "@/academy/billing/service";
import { getConfig } from "@/academy/config";
import type { LessonPdfKind } from "@/academy/pdf/lesson-documents";

type Body = Record<string, unknown> & { action?: string };

const ADMIN_ONLY = new Set([
  "lesson.status", "lesson.access", "content.import", "material.add", "ai.syllabus", "ai.lessonPlan", "ai.questions", "ai.apply",
  "video.publish", "video.unpublish", "video.link", "user.role", "user.status", "sub.grant", "sub.revoke", "sub.cancel", "ent.revoke",
  "assignment.publish", "assignment.unpublish", "assignment.settings", "assignment.points", "assignment.removeItem", "assignment.addItem",
  "material.publish", "material.unpublish", "lesson.timing", "plan.update", "coupon.create", "coupon.active", "billing.reconcile",
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
        const until = s(body.until) ? new Date(s(body.until)) : null;
        if (until && (Number.isNaN(until.getTime()) || until.getTime() < Date.now())) return json({ error: "תאריך סיום לא תקין" }, 400);
        if (!s(body.note).trim()) return json({ error: "יש לציין סיבה או אסמכתא (למשל מספר חשבונית)" }, 400);
        await new EntitlementService(db).grantManual(s(body.userId), course!.id, until, s(body.note), user.id);
        return json({ ok: true });
      }
      case "sub.cancel":
        await new EntitlementService(db).cancelSubscription(s(body.subscriptionId), user.id);
        return json({ ok: true });
      case "ent.revoke":
      case "sub.revoke":
        await new EntitlementService(db).revoke(s(body.entitlementId) || s(body.subscriptionId), user.id, s(body.note) || "בוטל על ידי מנהל");
        return json({ ok: true });
      case "assignment.publish":
        return json({ ok: true, ...(await new AssignmentService(db).publish(user, s(body.assignmentId))) });
      case "assignment.unpublish":
        await new AssignmentService(db).unpublish(user, s(body.assignmentId));
        return json({ ok: true });
      case "assignment.settings":
        await new AssignmentService(db).updateSettings(user, s(body.assignmentId), {
          questionCount: body.questionCount !== undefined && body.questionCount !== "" ? Number(body.questionCount) : undefined,
          solutionPolicy: (s(body.solutionPolicy) || undefined) as SolutionPolicy | undefined,
          allowRetake: body.allowRetake === undefined || body.allowRetake === "" ? undefined : body.allowRetake === true || body.allowRetake === "1" || body.allowRetake === "true",
          title: s(body.title) || undefined,
        });
        return json({ ok: true });
      case "assignment.points":
        await new AssignmentService(db).setItemPoints(user, s(body.assignmentId), s(body.questionId), body.points === "" || body.points === null || body.points === undefined ? null : Number(body.points));
        return json({ ok: true });
      case "assignment.removeItem":
        await new AssignmentService(db).removeItem(user, s(body.assignmentId), s(body.questionId));
        return json({ ok: true });
      case "assignment.addItem":
        await new AssignmentService(db).addItem(user, s(body.assignmentId), s(body.questionId));
        return json({ ok: true });
      case "material.generate": {
        const kind = s(body.kind) as LessonPdfKind;
        if (!["questions_pdf", "formulas_pdf", "homework_pdf", "summary_pdf"].includes(kind)) return json({ error: "סוג קובץ לא תקין" }, 400);
        const result = await new MaterialsService(db).generate(user, s(body.lessonId), kind);
        return json({ ok: true, reused: result.reused, assetId: result.asset.id, version: result.asset.version });
      }
      case "material.publish":
        await new MaterialsService(db).publish(user, s(body.assetId));
        return json({ ok: true });
      case "material.unpublish":
        await new MaterialsService(db).unpublish(user, s(body.assetId));
        return json({ ok: true });
      case "lesson.timing": {
        const parse = (v: unknown) => {
          const text = s(v).trim();
          if (!text) return [];
          return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
            const m = /^(\d+):(\d{2})\s+(.+)$/.exec(line);
            if (!m) throw new Error(`שורה לא תקינה: "${line}". הפורמט: דקות:שניות ואחריו כותרת`);
            return { atSeconds: Number(m[1]) * 60 + Number(m[2]), title: m[3] };
          });
        };
        const chapters = parse(body.chapters);
        const checkpoints = parse(body.checkpoints).map((c) => {
          const n = /(\d+)/.exec(c.title);
          if (!n) throw new Error(`בנקודת תרגול יש לציין את מספר השאלה: "${c.title}"`);
          return { atSeconds: c.atSeconds, question: Number(n[1]), title: c.title };
        });
        await db.run("UPDATE lessons SET video_chapters_json = ?, checkpoints_json = ? WHERE id = ?", [JSON.stringify(chapters), JSON.stringify(checkpoints), s(body.lessonId)]);
        await db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
          `aud_${crypto.randomUUID()}`, user.id, "lesson.timing", "lesson", s(body.lessonId), JSON.stringify({ chapters, checkpoints }),
        ]);
        return json({ ok: true });
      }
      case "plan.update":
        await new BillingService(db, getConfig().payments.provider).updatePlan(user, s(body.planId), {
          title: s(body.title) || undefined,
          priceAgorot: s(body.priceIls) ? Math.round(Number(s(body.priceIls)) * 100) : undefined,
          accessDays: s(body.accessDays) ? Number(s(body.accessDays)) : undefined,
          active: body.active === undefined || body.active === "" ? undefined : body.active === true || body.active === "1",
        });
        return json({ ok: true });
      case "coupon.create":
        await new BillingService(db, getConfig().payments.provider).createCoupon(user, {
          code: s(body.code), kind: s(body.kind) === "amount" ? "amount" : "percent",
          value: s(body.kind) === "amount" ? Math.round(Number(s(body.value)) * 100) : Number(s(body.value)),
          planId: s(body.planId) || null, courseId: course?.id ?? null,
          validUntil: s(body.validUntil) ? new Date(s(body.validUntil)).toISOString() : null,
          maxRedemptions: s(body.maxRedemptions) ? Number(s(body.maxRedemptions)) : null,
        });
        return json({ ok: true });
      case "coupon.active":
        await new BillingService(db, getConfig().payments.provider).setCouponActive(user, s(body.code), body.active === true || body.active === "1");
        return json({ ok: true });
      case "billing.reconcile":
        return json({ ok: true, report: await new BillingService(db, getConfig().payments.provider).reconcile() });
      case "contact.handled":
        await db.run("UPDATE contact_messages SET status = 'handled' WHERE id = ?", [s(body.messageId)]);
        return json({ ok: true });
      default:
        return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
