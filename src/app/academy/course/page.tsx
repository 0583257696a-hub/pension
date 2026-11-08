import Link from "next/link";
import { getCurrentUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { Badge, Card, PageTitle, lockReasonText } from "@/components/academy/ui";

export default async function CoursePage() {
  const user = await getCurrentUser();
  const syllabus = await new LearningService(await getDb()).getSyllabus(user);
  if (!syllabus) return <p>הקורס עדיין לא הוגדר.</p>;
  return (
    <div>
      <PageTitle title="תוכנית הלימודים" subtitle={syllabus.course.description_md} />
      <div className="space-y-4">
        {syllabus.units.map((unit) => (
          <Card key={unit.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">{unit.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{unit.description_md}</p>
              </div>
              {unit.status !== "published" && <Badge>בהכנה</Badge>}
            </div>
            <ol className="mt-4 divide-y divide-slate-100">
              {unit.lessons.map((lesson) => {
                const done = lesson.progress?.completed;
                const content = (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>{done ? "✓" : "•"}</span>
                      <div className="min-w-0">
                        <div className={`truncate font-semibold ${lesson.available ? "text-slate-900" : "text-slate-400"}`}>{lesson.title}</div>
                        {lesson.available && <div className="truncate text-xs text-slate-500">{lesson.description}</div>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {lesson.access === "free" && lesson.available && <Badge tone="green">חינם</Badge>}
                      {lesson.status !== "published" && <Badge tone={lesson.available ? "violet" : "slate"}>{lesson.available ? "טיוטה לצוות" : "בקרוב"}</Badge>}
                      {lesson.available && !lesson.allowed && <Badge tone="amber">{lockReasonText(lesson.lockReason)}</Badge>}
                    </div>
                  </div>
                );
                return <li key={lesson.id}>{lesson.available ? <Link href={`/academy/lesson/${lesson.slug}`} className="block hover:bg-slate-50">{content}</Link> : content}</li>;
              })}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}
