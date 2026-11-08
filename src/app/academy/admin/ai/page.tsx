import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { isLlmConfigured } from "@/academy/ai/client";
import { getConfig } from "@/academy/config";
import { parseJson } from "@/academy/lib/json";
import { LearningService } from "@/academy/services/learning";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import { Badge, Card } from "@/components/academy/ui";

const KIND: Record<string, string> = { syllabus_split: "חלוקת סילבוס", lesson_plan: "מערך שיעור", questions: "שאלות ופתרונות", solutions: "פתרונות", notebook_sources: "מקורות NotebookLM" };

export default async function AiAdmin() {
  const user = await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const materials = await db.all<{ id: string; kind: string; title: string; created_at: string; len: number }>(
    "SELECT id, kind, title, created_at, LENGTH(text_content) AS len FROM course_materials ORDER BY created_at DESC",
  );
  const jobs = await db.all<{ id: string; kind: string; target_id: string | null; status: string; error: string | null; model: string | null; created_at: string; output_json: string | null }>(
    "SELECT id, kind, target_id, status, error, model, created_at, output_json FROM content_jobs ORDER BY created_at DESC LIMIT 30",
  );
  const lessons = await db.all<{ id: string; title: string }>("SELECT l.id, l.title FROM lessons l JOIN units u ON u.id = l.unit_id ORDER BY u.position, l.position");
  const configured = isLlmConfigured();
  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-extrabold">מנוע יצירת תוכן</h2>
        <p className="mt-1 text-sm text-slate-600">
          Claude כותב טיוטות מתוך הסילבוס וחומרי הלימוד המורשים בלבד. כל שאלה עוברת בדיקה מול המנוע המתמטי ובסימולטור המחשבון, ונכנסת לסטטוס &quot;ממתינה לאישור&quot;. דבר לא מתפרסם בלי אישור מקצועי.
        </p>
        <div className="mt-2"><Badge tone={configured ? "green" : "amber"}>{configured ? `Claude מחובר · ${getConfig().anthropic.model}` : "לא הוגדר ANTHROPIC_API_KEY. אפשר להעלות חומרים, אבל לא ליצור תוכן."}</Badge></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-extrabold">1. סילבוס וחומרי לימוד מורשים</h3>
          {isAdmin ? (
            <div className="mt-3">
              <ActionForm action="material.add" submitLabel="הוספת חומר"
                fields={[
                  { name: "kind", label: "סוג", type: "select", options: [["syllabus", "סילבוס רשמי"], ["source", "חומר לימוד מורשה"], ["regulation", "רגולציה"], ["other", "אחר"]] },
                  { name: "title", label: "כותרת", required: true },
                  { name: "text", label: "תוכן (טקסט מלא)", type: "textarea", required: true },
                ]} />
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">העלאת חומרים מותרת למנהלים.</p>}
          <ul className="mt-4 space-y-1 text-sm">
            {materials.map((m) => <li key={m.id} className="flex justify-between gap-2"><span>[{m.kind}] {m.title}</span><span className="text-xs text-slate-500">{m.len.toLocaleString()} תווים</span></li>)}
            {!materials.length && <li className="text-slate-500">עדיין לא הועלו חומרים.</li>}
          </ul>
        </Card>

        <Card>
          <h3 className="font-extrabold">2. יצירת תוכן</h3>
          {isAdmin && configured ? (
            <div className="mt-3 space-y-4">
              <ActionButton action="ai.syllabus" label="חלוקת הסילבוס ליחידות ושיעורים" variant="secondary" />
              <ActionForm action="ai.lessonPlan" submitLabel="יצירת מערך שיעור" variant="secondary" resetOnSuccess={false}
                fields={[{ name: "lessonId", label: "שיעור", type: "select", options: lessons.map((l) => [l.id, l.title]) }]} />
              <ActionForm action="ai.questions" submitLabel="יצירת שאלות ופתרונות מדורגים" variant="secondary" resetOnSuccess={false}
                fields={[
                  { name: "lessonId", label: "שיעור", type: "select", options: lessons.map((l) => [l.id, l.title]) },
                  { name: "count", label: "מספר שאלות (עד 10)", type: "number", defaultValue: "4" },
                ]} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{configured ? "יצירת תוכן מותרת למנהלים." : "יש להגדיר מפתח API כדי ליצור תוכן."}</p>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="font-extrabold">3. משימות ותוצרים</h3>
        <ul className="mt-3 space-y-3">
          {jobs.map((job) => {
            const output = parseJson<unknown>(job.output_json, null);
            const questionItems = job.kind === "questions" && Array.isArray(output) ? (output as Array<{ draft: { stem: string }; report: { status: string } }>) : null;
            return (
              <li key={job.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{KIND[job.kind] ?? job.kind}</span>
                    <Badge tone={job.status === "done" ? "blue" : job.status === "applied" ? "green" : job.status === "failed" ? "red" : "slate"}>{job.status}</Badge>
                    <span className="text-xs text-slate-500">{new Date(job.created_at).toLocaleString("he-IL")} · {job.model}</span>
                  </div>
                  {job.status === "done" && isAdmin && <ActionButton action="ai.apply" payload={{ jobId: job.id }} label="החלה כטיוטה לבדיקה" variant="primary" />}
                </div>
                {job.error && <p className="mt-2 text-sm text-rose-700">{job.error}</p>}
                {questionItems && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {questionItems.map((item, i) => (
                      <li key={i} className="flex items-start justify-between gap-2">
                        <span className="min-w-0">{item.draft.stem}</span>
                        <Badge tone={item.report.status === "verified" ? "green" : item.report.status === "failed" ? "red" : "slate"}>{item.report.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {output !== null && !questionItems && (
                  <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-slate-600">פלט</summary><pre className="ltr mt-2 max-h-80 overflow-auto rounded bg-slate-50 p-2 text-start text-xs">{JSON.stringify(output, null, 2)}</pre></details>
                )}
              </li>
            );
          })}
          {!jobs.length && <li className="text-sm text-slate-500">עדיין לא הורצו משימות.</li>}
        </ul>
      </Card>
      {course && <p className="text-xs text-slate-500">הקורס: {course.title}</p>}
    </div>
  );
}
