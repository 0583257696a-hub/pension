import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { parseJson } from "@/academy/lib/json";
import { getNotebookProvider } from "@/academy/notebook/provider";
import { VIDEO_CHECKLIST } from "@/academy/notebook/production-package";
import { VideoStudioService } from "@/academy/services/video-studio";
import type { VideoFileChecks } from "@/academy/storage/video-checks";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import StudioUploader from "@/components/academy/admin/StudioUploader";
import VideoReviewForm from "@/components/academy/admin/VideoReviewForm";
import Md from "@/components/academy/Md";
import { Badge, Card } from "@/components/academy/ui";

export default async function StudioTarget({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (type !== "lesson" && type !== "question") notFound();
  const user = await requireStaff();
  const db = await getDb();
  const studio = new VideoStudioService(db);
  let input;
  try {
    input = await studio.packageInputFor(type, id);
  } catch {
    notFound();
  }
  const packageRow = await db.get<{ id: string }>("SELECT id FROM production_packages WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC LIMIT 1", [type, id]);
  const pkg = packageRow ? await studio.getPackage(packageRow.id) : null;
  const notebook = pkg?.notebook_id ? await studio.getNotebook(pkg.notebook_id) : null;
  const versions = await studio.versions(type, id);
  const views = await db.all<{ video_asset_id: string; views: number; viewers: number; avg_seconds: number; completed: number }>(
    `SELECT video_asset_id, COUNT(*) AS views, COUNT(DISTINCT user_id) AS viewers, AVG(seconds_watched) AS avg_seconds, SUM(completed) AS completed
     FROM video_views WHERE video_asset_id IN (SELECT id FROM video_assets WHERE target_type = ? AND target_id = ?) GROUP BY video_asset_id`,
    [type, id],
  );
  const viewsById = new Map(views.map((v) => [v.video_asset_id, v]));
  const otherQuestions = type === "question" ? await db.all<{ id: string; stem_md: string }>("SELECT id, stem_md FROM questions WHERE id != ? AND status != 'rejected' ORDER BY lesson_id, position", [id]) : [];
  const calc = input.question?.calculator ?? null;
  const isAdmin = user.role === "admin";
  const provider = getNotebookProvider();

  return (
    <div className="space-y-4">
      <Link href="/academy/admin/studio" className="text-sm font-semibold text-brand-700">← Video Studio</Link>
      <Card>
        <div className="text-xs text-muted">{type === "lesson" ? "סרטון שיעור" : "סרטון פתרון"} · {input.lessonTitle}</div>
        <h2 className="text-xl font-extrabold">{input.title}</h2>
        {input.question && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {calc ? <Badge tone={calc.verified ? "green" : "amber"}>{calc.verified ? "רצף מחשבון מאומת: הסרטון יבנה סביבו" : "רצף המחשבון ממתין לאימות. אי אפשר לאשר את הסרטון"}</Badge> : <Badge>אין פתרון במחשבון: הסרטון מציג פתרון מתמטי</Badge>}
            {calc && <Link className="text-xs font-bold text-brand-700" href={`/render/calculator/${id}`}>פתיחת מקטע המחשבון המונפש ←</Link>}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-extrabold">1. חבילת הפקה</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton action="studio.package" payload={{ targetType: type, targetId: id, useClaude: false }} label={pkg ? "יצירת חבילה מחדש (תבנית)" : "יצירת חבילת הפקה"} variant="primary" />
          <ActionButton action="studio.package" payload={{ targetType: type, targetId: id, useClaude: true }} label="יצירה עם תסריט מ-Claude" variant="secondary" />
        </div>
        {pkg && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted">נוצרה {new Date(pkg.created_at).toLocaleString("he-IL")} · {pkg.generated_by === "claude" ? "תסריט מ-Claude, נבדק מול המספרים המאומתים" : "תבנית דטרמיניסטית"}</p>
            <details className="rounded-xl border border-line p-3" open><summary className="cursor-pointer font-bold">תסריט</summary><Md text={pkg.script_md} /></details>
            <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer font-bold">הנחיות ל-NotebookLM</summary><pre className="ltr mt-2 whitespace-pre-wrap text-start text-xs">{pkg.instructions_md}</pre></details>
            <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer font-bold">מסמכי מקור ({pkg.sources.length})</summary>
              {pkg.sources.map((s) => <div key={s.title} className="mt-3 border-t border-line-soft pt-2"><div className="text-sm font-bold">{s.title}</div><Md text={s.content} className="text-sm" /></div>)}
            </details>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-extrabold">2. מחברת NotebookLM</h3>
        <p className="mt-1 text-sm text-muted">
          {provider.automatic
            ? "המערכת יוצרת מחברת ב-Gemini Notebook Enterprise ומעלה את מסמכי המקור דרך ה-API הרשמי. יצירת ה-Video Overview נעשית ידנית בממשק NotebookLM."
            : "לא הוגדרה גישת API. צרו מחברת ב-NotebookLM, העלו את מסמכי המקור מחבילת ההפקה, והדביקו כאן את הקישור."}
        </p>
        {pkg && !notebook && <div className="mt-3"><ActionButton action="studio.notebook" payload={{ packageId: pkg.id }} label="הכנת מחברת NotebookLM" variant="primary" /></div>}
        {!pkg && <p className="mt-2 text-sm text-muted">יש ליצור קודם חבילת הפקה.</p>}
        {notebook && (
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={notebook.status === "ready" ? "green" : notebook.status === "error" ? "red" : "amber"}>{notebook.status}</Badge>
              <span className="text-muted">{notebook.title}</span>
              {notebook.external_url && <a className="font-bold text-brand-700" href={notebook.external_url} target="_blank" rel="noreferrer">פתיחת המחברת ←</a>}
            </div>
            {notebook.error && <p className="text-danger-ink">{notebook.error}</p>}
            <ul className="space-y-1">
              {notebook.sources.map((s) => <li key={s.id} className="flex justify-between gap-2"><span>{s.title}</span><span className="text-xs text-muted">{s.status}{s.status_raw ? ` (${s.status_raw})` : ""}</span></li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              {provider.automatic && <ActionButton action="studio.notebookRefresh" payload={{ notebookId: notebook.id }} label="בדיקת מצב עיבוד המקורות" variant="secondary" />}
            </div>
            <div className="max-w-xl">
              <ActionForm action="studio.notebookLink" payload={{ notebookId: notebook.id }} submitLabel="שמירת קישור למחברת" variant="secondary"
                fields={[{ name: "url", label: "קישור למחברת ב-NotebookLM", required: true, placeholder: "https://notebooklm..." }]} />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-extrabold">3. העלאת הסרטון שהופק</h3>
        <p className="mt-1 text-sm text-muted">MP4 או WebM, עד 2GB. המערכת בודקת סוג, מבנה, משך ורזולוציה, ומעבירה את הגרסה לאישור.</p>
        <div className="mt-3"><StudioUploader targetType={type} targetId={id} packageId={pkg?.id ?? null} /></div>
      </Card>

      <Card>
        <h3 className="font-extrabold">4. גרסאות, בדיקה ופרסום</h3>
        {versions.length === 0 && <p className="mt-2 text-sm text-muted">עדיין לא הועלו גרסאות.</p>}
        <div className="mt-3 space-y-4">
          {versions.map((v) => {
            const checks = parseJson<{ file?: VideoFileChecks; review?: { checklist: Record<string, boolean>; at: string } }>(v.checks_json, {});
            const stats = viewsById.get(v.id);
            return (
              <div key={v.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold">גרסה {v.version}</span>
                    <Badge tone={v.status === "published" ? "green" : v.status === "review" ? "amber" : v.status === "rejected" ? "red" : v.status === "approved" ? "blue" : "slate"}>{v.status}</Badge>
                    <span className="text-xs text-muted">{v.title} · {(v.size_bytes / 1024 / 1024).toFixed(1)}MB{v.duration_seconds ? ` · ${v.duration_seconds} שנ׳` : ""}{v.width ? ` · ${v.width}×${v.height}` : ""}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isAdmin && v.status === "approved" && <ActionButton action="video.publish" payload={{ assetId: v.id }} label="פרסום" variant="primary" confirm="לפרסם את הגרסה לתלמידים? גרסה מפורסמת קודמת תוחלף." />}
                    {isAdmin && v.status === "published" && <ActionButton action="video.unpublish" payload={{ assetId: v.id }} label="הסרה מפרסום" variant="ghost" confirm="להסיר את הסרטון מהתלמידים?" />}
                  </div>
                </div>
                {checks.file && !checks.file.passed && <ul className="mt-2 text-sm text-danger-ink">{checks.file.issues.map((i) => <li key={i}>✗ {i}</li>)}</ul>}
                {v.review_note && <p className="mt-2 text-sm text-muted">הערת בודק: {v.review_note}</p>}
                {stats && <p className="mt-2 text-xs text-muted">צפיות: {stats.views} · צופים: {stats.viewers} · ממוצע {Math.round(stats.avg_seconds)} שנ׳ · צפו עד הסוף: {stats.completed}</p>}
                {["review", "approved", "published"].includes(v.status) && (
                  <video className="mt-3 aspect-video w-full max-w-xl rounded-lg bg-black" controls preload="metadata" src={`/api/academy/media/${v.id}`} />
                )}
                {v.status === "review" && <div className="mt-3"><VideoReviewForm assetId={v.id} checklist={VIDEO_CHECKLIST} /></div>}
                {isAdmin && v.status === "published" && type === "question" && otherQuestions.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-bold text-brand-700">קישור הסרטון לשאלה נוספת</summary>
                    <div className="mt-2 max-w-xl">
                      <ActionForm action="video.link" payload={{ assetId: v.id }} submitLabel="קישור"
                        fields={[{ name: "questionId", label: "שאלה", type: "select", options: otherQuestions.map((q) => [q.id, q.stem_md.slice(0, 80)]) }]} />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
