import Link from "next/link";
import { getCurrentUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { IconCheck, IconChevronLeft, IconLock } from "@/components/academy/icons";
import { Badge, PageTitle, Progress, lockReasonText } from "@/components/academy/ui";

export default async function CoursePage() {
  const user = await getCurrentUser();
  const syllabus = await new LearningService(await getDb()).getSyllabus(user);
  if (!syllabus) return <p>הקורס עדיין לא הוגדר.</p>;
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageTitle title="תוכנית הלימודים" subtitle={syllabus.course.description_md} />
      <div className="flex flex-col gap-6">
        {syllabus.units.map((unit, ui) => {
          const open = unit.lessons.filter((l) => l.available);
          const done = open.filter((l) => l.progress?.completed).length;
          return (
            <section key={unit.id} className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="flex flex-col gap-3 border-b border-line bg-surface-2 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] text-muted">פרק {ui + 1}</div>
                    <h2 className="mt-1 text-lg font-bold">{unit.title.replace(/^יחידה \d+: /, "")}</h2>
                  </div>
                  {unit.status !== "published" ? <Badge>בהכנה</Badge> : <span className="ltr text-[13px] text-muted">{done}/{open.length}</span>}
                </div>
                <p className="text-[15px] text-muted">{unit.description_md}</p>
                {unit.status === "published" && open.length > 0 && <Progress value={(done / open.length) * 100} />}
              </div>
              <ol className="divide-y divide-line-soft">
                {unit.lessons.map((lesson, li) => {
                  const completed = lesson.progress?.completed;
                  const row = (
                    <div className="flex items-center gap-4 px-6 py-4">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${completed ? "bg-success text-white" : lesson.available ? "bg-line-soft text-subtle" : "bg-line-soft text-faint"}`}>
                        {completed ? <IconCheck size={14} /> : li + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[15px] font-semibold ${lesson.available ? "text-ink" : "text-faint"}`}>{lesson.title.replace(/^שיעור \d+: /, "")}</div>
                        {lesson.available && <div className="truncate text-[13px] text-muted">{lesson.description}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {lesson.access === "free" && lesson.available && <Badge tone="green">חינם</Badge>}
                        {lesson.status !== "published" && <Badge tone={lesson.available ? "violet" : "slate"}>{lesson.available ? "טיוטה לצוות" : "בקרוב"}</Badge>}
                        {lesson.available && !lesson.allowed && <span className="flex items-center gap-1 text-[13px] text-muted"><IconLock size={14} /> {lockReasonText(lesson.lockReason)}</span>}
                        {lesson.available && lesson.allowed && <IconChevronLeft size={16} className="text-faint" />}
                      </div>
                    </div>
                  );
                  return <li key={lesson.id}>{lesson.available ? <Link href={`/academy/lesson/${lesson.slug}`} className="block hover:bg-surface">{row}</Link> : row}</li>;
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
