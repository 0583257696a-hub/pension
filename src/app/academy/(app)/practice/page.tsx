import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { IconChevronLeft, IconLock } from "@/components/academy/icons";
import { PageTitle, lockReasonText } from "@/components/academy/ui";

/** Practice index: every open lesson with its practice questions and the student's accuracy. */
export default async function PracticeIndex() {
  const user = await requireUser("/academy/practice");
  const service = new LearningService(await getDb());
  const syllabus = await service.getSyllabus(user);
  if (!syllabus) return <p>הקורס עדיין לא הוגדר.</p>;
  const accuracy = new Map((await service.topicAccuracy(user)).map((t) => [t.lesson_id, t]));
  const units = syllabus.units.map((u) => ({ ...u, lessons: u.lessons.filter((l) => l.available) })).filter((u) => u.lessons.length);

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageTitle title="תרגול שאלות" subtitle="שאלות בסגנון הבחינה לפי נושא. אחרי כל תשובה מוצג הפתרון המלא, קודם במחשבון הפיננסי." />
      <div className="flex flex-col gap-6">
        {units.map((unit) => (
          <section key={unit.id} className="overflow-hidden rounded-xl border border-line bg-white">
            <h2 className="border-b border-line bg-surface-2 px-6 py-4 text-[15px] font-bold">{unit.title}</h2>
            <ul className="divide-y divide-line-soft">
              {unit.lessons.map((lesson) => {
                const acc = accuracy.get(lesson.id);
                const row = (
                  <div className="flex items-center gap-4 px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-ink">{lesson.title}</div>
                      <div className="truncate text-[13px] text-muted">{acc ? `${acc.total} תשובות · דיוק ${acc.accuracy}%` : "עוד לא תרגלת את הנושא"}</div>
                    </div>
                    {lesson.allowed ? <IconChevronLeft size={16} className="text-faint" /> : (
                      <span className="flex items-center gap-1.5 text-[13px] text-muted"><IconLock size={14} /> {lockReasonText(lesson.lockReason)}</span>
                    )}
                  </div>
                );
                return <li key={lesson.id}>{lesson.allowed ? <Link href={`/academy/practice/${lesson.slug}`} className="block hover:bg-surface">{row}</Link> : row}</li>;
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
