import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { PDF_KIND_LABEL } from "@/academy/pdf/lesson-documents";
import { MaterialsService } from "@/academy/services/materials";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import { Badge, Card } from "@/components/academy/ui";

const KINDS = ["questions_pdf", "formulas_pdf", "summary_pdf", "homework_pdf"] as const;

export default async function AdminLessonMaterials({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const me = await requireStaff();
  const db = await getDb();
  const lesson = await db.get<{ id: string; title: string; checkpoints_json: string; video_chapters_json: string }>("SELECT id, title, checkpoints_json, video_chapters_json FROM lessons WHERE id = ?", [lessonId]);
  if (!lesson) notFound();
  const assets = await new MaterialsService(db).list(lessonId);
  const isAdmin = me.role === "admin";
  const mmss = (s: number | null) => (s === null ? "?:??" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  const chapters = JSON.parse(lesson.video_chapters_json) as Array<{ atSeconds: number | null; title: string }>;
  const checkpoints = JSON.parse(lesson.checkpoints_json) as Array<{ atSeconds: number | null; question: number; title: string }>;
  return (
    <div className="space-y-4">
      <Card>
        <Link href="/academy/admin/materials" className="text-sm text-muted">← קובצי PDF</Link>
        <h1 className="mt-1 text-xl font-extrabold">{lesson.title}</h1>
      </Card>
      {KINDS.map((kind) => {
        const list = assets.filter((a) => a.kind === kind);
        return (
          <Card key={kind}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{PDF_KIND_LABEL[kind]}</h2>
              <ActionButton action="material.generate" payload={{ lessonId, kind }} label="הפקת PDF מהתוכן הנוכחי" variant="secondary" />
            </div>
            {list.length === 0 ? <p className="mt-2 text-sm text-muted">עדיין לא הופק.</p> : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {list.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="font-semibold">גרסה {a.version}</span>
                    <Badge tone={a.status === "published" ? "green" : a.status === "draft" ? "amber" : "slate"}>{a.status === "published" ? "מפורסם" : a.status === "draft" ? "טיוטה" : "הוחלף"}</Badge>
                    {a.outdated && a.status !== "superseded" && <Badge tone="red">לא תואם לתוכן הנוכחי</Badge>}
                    <span className="text-muted">{Math.round(a.size_bytes / 1024)} KB · {new Date(a.created_at).toLocaleString("he-IL")}</span>
                    <a className="font-semibold text-accent" href={`/api/academy/materials/${a.id}`} target="_blank" rel="noopener">תצוגה</a>
                    {isAdmin && a.status === "draft" && <ActionButton action="material.publish" payload={{ assetId: a.id }} label="פרסום" variant="primary" confirm="לפרסם את הקובץ לתלמידים? הגרסה המפורסמת הקודמת תוחלף." />}
                    {isAdmin && a.status === "published" && <ActionButton action="material.unpublish" payload={{ assetId: a.id }} label="הסרה" variant="ghost" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
      {isAdmin && (
        <Card>
          <h2 className="text-lg font-bold">תזמון פרקים ונקודות תרגול בסרטון</h2>
          <p className="mt-1 text-sm text-muted">שורה לכל פריט: <span className="ltr">דקות:שניות</span> ואחריו כותרת. בנקודת תרגול יש לציין את מספר השאלה מקובץ שאלות השיעור.</p>
          <div className="mt-3 max-w-xl">
            <ActionForm
              action="lesson.timing"
              payload={{ lessonId }}
              submitLabel="שמירת תזמון"
              resetOnSuccess={false}
              fields={[
                { name: "chapters", label: "פרקים בסרטון", type: "textarea", defaultValue: chapters.filter((c) => c.atSeconds !== null).map((c) => `${mmss(c.atSeconds)} ${c.title}`).join("\n"), placeholder: chapters.map((c) => `0:00 ${c.title}`).join("\n") },
                { name: "checkpoints", label: "נקודות תרגול", type: "textarea", defaultValue: checkpoints.filter((c) => c.atSeconds !== null).map((c) => `${mmss(c.atSeconds)} ${c.title}`).join("\n"), placeholder: checkpoints.map((c) => `0:00 ${c.title}`).join("\n") },
              ]}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
