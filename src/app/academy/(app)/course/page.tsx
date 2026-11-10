import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService, LESSON_STATE_LABEL } from "@/academy/services/learning";
import { IconCheck, IconLock } from "@/components/academy/icons";
import { Badge, btn, PageTitle } from "@/components/academy/ui";

/** Numbered lesson list (spec §5): "שיעור 1", "שיעור 2" … with "צפה בשיעור" and "פתח מטלה". */
export default async function CoursePage() {
  const user = await requireUser("/academy/course");
  const syllabus = await new LearningService(await getDb()).getSyllabus(user);
  if (!syllabus) return <p className="text-muted">אין קורס פעיל.</p>;
  const visible = syllabus.lessons.filter((l) => l.available);
  const upcoming = syllabus.lessons.filter((l) => !l.available);
  const parts = [...new Set(visible.map((l) => l.part))];

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title={syllabus.course.title} subtitle={`${visible.length} שיעורים זמינים. כל שיעור כולל קובצי PDF, סרטון ומטלה של 20 שאלות.`} />
      {parts.map((part) => (
        <section key={part} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">{part}</h2>
          <ol className="overflow-hidden rounded-xl border border-line bg-white">
            {visible.filter((l) => l.part === part).map((l) => (
              <li key={l.id} className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[15px] font-bold ${l.state === "completed" ? "bg-success-soft text-success-ink" : "bg-line-soft text-ink"}`}>
                  {l.state === "completed" ? <IconCheck size={18} /> : l.number}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-bold text-ink">{l.title}</h3>
                    {l.status !== "published" && <Badge tone="amber">טיוטה · תצוגת צוות</Badge>}
                    {l.access === "free" && <Badge tone="blue">פתוח לצפייה</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{l.topics.slice(0, 5).join(" · ")}</p>
                  <p className="mt-1 text-xs text-faint">
                    {LESSON_STATE_LABEL[l.state]}
                    {l.assignment?.grade !== null && l.assignment?.grade !== undefined ? ` · ציון ${l.assignment.title}: ${l.assignment.grade}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {l.allowed ? (
                    <>
                      <Link className={btn.secondary} href={`/academy/lesson/${l.slug}`}>צפה בשיעור</Link>
                      {l.assignment && <Link className={btn.dark} href={`/academy/assignments/${l.assignment.id}`}>פתח מטלה</Link>}
                    </>
                  ) : (
                    <Link href="/academy/pricing" className="inline-flex items-center gap-1.5 text-sm text-muted">
                      <IconLock size={14} /> לתלמידי הקורס
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {upcoming.length > 0 && (
        <p className="text-sm text-muted">שיעורים נוספים נמצאים בהפקה ויתווספו אחרי בדיקה מקצועית.</p>
      )}
    </div>
  );
}
