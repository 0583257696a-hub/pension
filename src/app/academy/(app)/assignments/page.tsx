import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AssignmentService } from "@/academy/services/assignments";
import { LearningService } from "@/academy/services/learning";
import { IconLock } from "@/components/academy/icons";
import { Badge, btn, PageTitle } from "@/components/academy/ui";

/** "מטלות" (spec §4 step 6): Assignment 1, 2, … each with its own grade. */
export default async function AssignmentsPage() {
  const user = await requireUser("/academy/assignments");
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const list = course ? await new AssignmentService(db).listForStudent(user, course.id) : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="מטלות" subtitle="לכל שיעור מטלה של שאלות אמריקאיות קבועות. הציון הרשמי הוא של ההגשה הראשונה; אפשר לתרגל שוב אחר כך." />
      {list.length === 0 && <p className="text-[15px] text-muted">עדיין אין מטלות מפורסמות.</p>}
      <ol className="overflow-hidden rounded-xl border border-line bg-white">
        {list.map((a) => (
          <li key={a.id} className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-bold text-ink">{a.title}</h2>
                <span className="text-sm text-muted">· {a.questionCount} שאלות</span>
                {a.official ? <Badge tone="green">הוגשה · ציון {a.official.score}</Badge> : a.inProgress ? <Badge tone="blue">בתהליך · נענו {a.inProgress.answered}</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{a.lessonTitle}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {!a.allowed ? (
                <Link href="/academy/pricing" className="inline-flex items-center gap-1.5 text-sm text-muted"><IconLock size={14} /> לתלמידי הקורס</Link>
              ) : (
                <>
                  {a.official && <Link className={btn.secondary} href={`/academy/attempts/${a.official.attemptId}/results`}>לתוצאות</Link>}
                  <Link className={btn.dark} href={`/academy/assignments/${a.id}`}>{a.inProgress ? "להמשך" : a.official ? "לתרגול נוסף" : "פתיחת המטלה"}</Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
