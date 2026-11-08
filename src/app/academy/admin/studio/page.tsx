import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { getNotebookProvider } from "@/academy/notebook/provider";
import { VideoStudioService } from "@/academy/services/video-studio";
import { Badge, Card } from "@/components/academy/ui";

const VIDEO_STATUS: Record<string, [string, "green" | "amber" | "red" | "slate" | "blue"]> = {
  uploading: ["בהעלאה", "slate"], uploaded: ["הועלה", "slate"], review: ["ממתין לבדיקה", "amber"], approved: ["מאושר, לא פורסם", "blue"],
  rejected: ["נדחה", "red"], published: ["פורסם", "green"], superseded: ["גרסה קודמת", "slate"],
};

function VideoCell({ video }: { video: Awaited<ReturnType<VideoStudioService["listTargets"]>>[number]["video"] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {video.published ? <Badge tone="green">יש סרטון (v{video.published.version})</Badge> : <Badge>אין סרטון</Badge>}
      {video.latest && video.latest.status !== "published" && <Badge tone={VIDEO_STATUS[video.latest.status]?.[1] ?? "slate"}>v{video.latest.version}: {VIDEO_STATUS[video.latest.status]?.[0]}</Badge>}
      {video.package && <Badge tone="blue">חבילת הפקה</Badge>}
      {video.notebook && <Badge tone={video.notebook.status === "error" ? "red" : "violet"}>מחברת: {video.notebook.status}</Badge>}
      {video.stats && <span className="text-xs text-slate-500">{video.stats.views} צפיות · {video.stats.viewers} צופים</span>}
    </div>
  );
}

export default async function StudioList() {
  await requireStaff();
  const targets = await new VideoStudioService(await getDb()).listTargets();
  const notebook = getNotebookProvider();
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-extrabold">Video Studio</h2>
        <p className="mt-1 text-sm text-slate-600">
          תהליך ההפקה: חבילת הפקה ← מחברת NotebookLM ({notebook.automatic ? "נוצרת אוטומטית דרך ה-API" : "מצב ידני"}) ← הפקת הסרטון ב-NotebookLM והורדתו ← העלאה ובדיקות קובץ ← אישור אקדמי ואימות רצף המחשבון ← פרסום. מקטעי המחשבון מופקים מהרצף המאומת ולא ב-NotebookLM.
        </p>
      </Card>
      {targets.map((lesson) => (
        <Card key={lesson.id}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-slate-500">{lesson.unitTitle}</div>
              <Link href={`/academy/admin/studio/lesson/${lesson.id}`} className="font-extrabold hover:text-brand-700">סרטון שיעור: {lesson.title}</Link>
            </div>
            <VideoCell video={lesson.video} />
          </div>
          {lesson.questions.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {lesson.questions.map((q) => (
                <li key={q.id} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/academy/admin/studio/question/${q.id}`} className="min-w-0 truncate hover:text-brand-700">פתרון: {q.stem}</Link>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {q.hasCalculator && <Badge tone={q.calculatorVerified ? "green" : "amber"}>{q.calculatorVerified ? "רצף מחשבון מאומת" : "רצף מחשבון ממתין לאימות"}</Badge>}
                    <VideoCell video={q.video} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
