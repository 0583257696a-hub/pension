import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { getCalculator } from "@/academy/calculator";
import { ContentAdminService } from "@/academy/services/content-admin";
import { LearningService } from "@/academy/services/learning";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import CalculatorSteps from "@/components/academy/CalculatorSteps";
import Md from "@/components/academy/Md";
import { Badge, Card } from "@/components/academy/ui";

const Q_STATUS: Record<string, [string, "green" | "amber" | "red" | "slate"]> = {
  approved: ["מאושרת", "green"],
  review: ["ממתינה לאישור", "amber"],
  rejected: ["נדחתה", "red"],
  draft: ["טיוטה", "slate"],
};

export default async function LessonReview({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const user = await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const model = course?.calculator_model ?? "casio-fc-200v";
  const detail = await new ContentAdminService(db).lessonDetail(lessonId, model);
  if (!detail) notFound();
  const { lesson } = detail;
  const modelName = getCalculator(model).model.name;
  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-4">
      <Link href="/academy/admin/content" className="text-sm font-semibold text-brand-700">← לכל התכנים</Link>
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold">{lesson.title}</h2>
            <p className="text-sm text-muted">{lesson.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={lesson.status === "published" ? "green" : "amber"}>{lesson.status === "published" ? "פורסם" : lesson.status === "review" ? "בבדיקה" : "טיוטה"}</Badge>
              <Badge>{lesson.access === "free" ? "שיעור חינמי" : "למנויים"}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/academy/lesson/${lesson.slug}`} className="rounded-xl border border-input px-3 py-2 text-sm font-bold">תצוגה מקדימה</Link>
            {isAdmin && lesson.status !== "published" && (
              <ActionButton action="lesson.status" payload={{ lessonId, decision: "publish" }} label="פרסום השיעור לתלמידים" variant="primary"
                confirm={lesson.access === "paid" ? "השיעור יפורסם למנויים (תוכן בתשלום). רק שאלות שאושרו יוצגו. לאשר פרסום?" : "השיעור יפורסם לכל הנרשמים. לאשר?"} />
            )}
            {isAdmin && lesson.status === "published" && (
              <ActionButton action="lesson.status" payload={{ lessonId, decision: "unpublish" }} label="הסרה מפרסום" confirm="השיעור יוסתר מהתלמידים. ההתקדמות שלהם נשמרת. להמשיך?" />
            )}
            {isAdmin && (
              <ActionButton action="lesson.access" payload={{ lessonId, access: lesson.access === "free" ? "paid" : "free" }} label={lesson.access === "free" ? "הפוך לתוכן מנויים" : "הפוך לתוכן חינמי"}
                confirm="לשנות את הרשאת הגישה לשיעור?" variant="ghost" />
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-extrabold">סיכום השיעור</h3>
        <Md text={lesson.summary_md || "_אין עדיין סיכום_"} />
      </Card>

      {detail.examples.length > 0 && (
        <Card>
          <h3 className="font-extrabold">דוגמאות פתורות</h3>
          {detail.examples.map((e) => (
            <div key={e.title} className="mt-3 rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{e.title}</span>
                <div className="flex gap-2">
                  {e.verification && <Badge tone={e.verification.status === "verified" ? "green" : "red"}>מנוע מתמטי: {e.verification.status === "verified" ? "תקין" : "נכשל"}</Badge>}
                  {e.calculatorVerdict && <Badge tone={e.calculatorVerdict.verified ? "green" : "amber"}>{e.calculatorVerdict.verified ? "מחשבון מאומת" : e.calculatorVerdict.simulation.ok ? "סימולטור תקין, ממתין לאימות עובדות" : "סימולטור נכשל"}</Badge>}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {detail.questions.map((q, index) => {
        const [label, tone] = Q_STATUS[q.status] ?? ["?", "slate"];
        const v = q.verification;
        return (
          <Card key={q.id}>
            <div id={q.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold">שאלה {index + 1}</span>
                <Badge tone={tone}>{label}</Badge>
                <Badge tone="blue">{q.role === "quiz" ? "מבחן סיכום" : "תרגול"}</Badge>
                <Badge tone={q.source === "ai" ? "violet" : "slate"}>{q.source === "ai" ? "נוצרה ב-AI" : "ידנית"}</Badge>
              </div>
              <Badge tone={v.status === "verified" ? "green" : v.status === "not_applicable" ? "slate" : "red"}>
                {v.status === "verified" ? "אומתה מול המנוע המתמטי" : v.status === "not_applicable" ? "שאלה עיונית: בדיקה אנושית בלבד" : "נכשלה בבדיקה"}
              </Badge>
            </div>
            <div className="mt-3 font-semibold"><Md text={q.stem_md} /></div>
            <ul className="mt-2 grid gap-1 text-sm">
              {q.options.map((o) => (
                <li key={o.key} className={`rounded-lg px-3 py-1.5 ${o.key === q.correct_key ? "bg-success-tint font-bold text-success-ink" : "bg-surface"}`}>
                  {o.key.toUpperCase()}. {o.text}{o.value !== undefined ? <span className="ltr ms-2 text-xs text-muted">[{o.value}]</span> : null}
                </li>
              ))}
            </ul>

            <details className="mt-3 rounded-xl border border-line p-3" open={v.status === "failed"}>
              <summary className="cursor-pointer text-sm font-bold">דוח בדיקה אוטומטית ({v.checks.filter((c) => c.ok).length}/{v.checks.length})</summary>
              {v.check && <div className="ltr mt-2 rounded bg-surface px-2 py-1 text-start font-mono text-xs">{v.check.expression}</div>}
              <ul className="mt-2 space-y-1 text-sm">
                {v.checks.map((c, i) => (
                  <li key={i} className={c.ok ? "text-success-ink" : "text-danger-ink"}>{c.ok ? "✓" : "✗"} {c.label}: <span className="text-xs">{c.detail}</span></li>
                ))}
              </ul>
            </details>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <details className="rounded-xl border border-line p-3" open>
                <summary className="cursor-pointer text-sm font-bold">פתרון במחשבון {q.calculatorVerdict ? (q.calculatorVerdict.verified ? "(מאומת, מוצג לתלמידים)" : "(לא מוצג לתלמידים)") : "(אין)"}</summary>
                {q.calculator && q.calculatorVerdict ? (
                  <div className="mt-2">
                    {!q.calculatorVerdict.verified && (
                      <p className="mb-2 rounded-lg bg-warn-soft px-2 py-1 text-xs text-warn-ink">
                        {q.calculatorVerdict.simulation.ok
                          ? `ממתין לאימות העובדות: ${[...q.calculatorVerdict.pendingFacts, ...q.calculatorVerdict.rejectedFacts].join(", ")}`
                          : `הסימולטור נכשל: ${q.calculatorVerdict.simulation.errors.join(" | ")}`}
                      </p>
                    )}
                    <CalculatorSteps sequence={q.calculator.sequence} interpretation={q.calculator.interpretation} modelName={modelName} />
                    <Link className="mt-2 inline-block text-xs font-bold text-brand-700" href={`/render/calculator/${q.id}`}>הדמיית המחשבון (מקטע לסרטון) ←</Link>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">אין פתרון במחשבון. לתלמידים יוצג הפתרון המתמטי.</p>
                )}
              </details>
              <details className="rounded-xl border border-line p-3" open>
                <summary className="cursor-pointer text-sm font-bold">פתרון באמצעות נוסחה</summary>
                <p className="mt-2 text-sm">{q.short_explanation_md}</p>
                <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm">{q.steps.map((s, i) => <li key={i}><b>{s.title}:</b> {s.body}</li>)}</ol>
              </details>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-3 lg:flex-row lg:items-start">
              {q.status !== "approved" && (
                <ActionButton action="question.review" payload={{ questionId: q.id, decision: "approve", note: "" }} label="אישור מקצועי" variant="primary" />
              )}
              <ActionButton action="question.reverify" payload={{ questionId: q.id }} label="הרצת בדיקה מחדש" variant="ghost" />
              <div className="flex-1">
                <details>
                  <summary className="cursor-pointer text-sm font-bold text-body">דחייה או בקשת תיקון</summary>
                  <div className="mt-2">
                    <ActionForm action="question.review" payload={{ questionId: q.id }} submitLabel="שמירת החלטה" variant="secondary"
                      fields={[
                        { name: "decision", label: "החלטה", type: "select", options: [["request_changes", "החזרה לתיקון"], ["reject", "דחייה"]] },
                        { name: "note", label: "הערות לבודק או לכותב", type: "textarea", required: true },
                      ]} />
                  </div>
                </details>
              </div>
            </div>
          </Card>
        );
      })}

      {detail.reviews.length > 0 && (
        <Card>
          <h3 className="font-extrabold">היסטוריית החלטות</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {detail.reviews.map((r, i) => (
              <li key={i}>{new Date(r.created_at).toLocaleString("he-IL")} · {r.email ?? "?"} · {r.action}{r.note ? ` · ${r.note}` : ""} · {r.target_id}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
