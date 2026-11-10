import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AssignmentError, AssignmentService } from "@/academy/services/assignments";
import { AccessDeniedError } from "@/academy/services/learning";
import { btn, Card, optionLetter } from "@/components/academy/ui";

/** Assignment summary (spec §4 step 8, §32): correct count, grade, and the questions answered wrongly. */
export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/academy/attempts/${id}/results`);
  let r;
  try {
    r = await new AssignmentService(await getDb()).results(user, id);
  } catch (error) {
    if (error instanceof AssignmentError) redirect(`/academy/attempts/${id}`);
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  const { summary } = r;
  const wrong = r.questions.filter((q) => !q.isCorrect);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <div className="text-sm text-muted">{r.lesson.title}{r.attempt.kind === "practice" ? " · תרגול חוזר" : ""}</div>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">סיימת את {r.assignment.title}</h1>
        <p className="mt-3 text-[17px] text-body">ענית נכון על {summary.correct} מתוך {summary.total} שאלות</p>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-[15px] text-muted">הציון שלך:</span>
          <span className="ltr text-5xl font-extrabold text-ink">{summary.score}</span>
        </div>
        {r.attempt.kind === "practice" && summary.official && (
          <p className="mt-3 text-sm text-muted">הציון הרשמי במטלה נשאר {summary.official.score} (ההגשה הראשונה).</p>
        )}
        {summary.viewedBeforeAnswer.length > 0 && (
          <p className="mt-2 text-sm text-muted">בשאלות {summary.viewedBeforeAnswer.join(", ")} נצפה הפתרון לפני שנבחרה תשובה.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {wrong.length > 0 && <a className={btn.dark} href="#wrong">צפה בשאלות שטעית בהן</a>}
          <Link className={btn.secondary} href={`/academy/attempts/${id}?q=1`}>מעבר על כל השאלות והפתרונות</Link>
          <Link className={btn.ghost} href={`/academy/lesson/${r.lesson.slug}`}>חזרה לשיעור</Link>
        </div>
      </Card>

      {wrong.length > 0 && (
        <section id="wrong" className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ink">שאלות שטעית בהן ({wrong.length})</h2>
          <ul className="flex flex-col gap-2">
            {wrong.map((q) => (
              <li key={q.id} className="rounded-xl border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-accent">שאלה {q.position}</div>
                    <p className="mt-1 line-clamp-2 text-[15px] text-ink">{q.stem}</p>
                    <p className="mt-2 text-sm text-muted">
                      בחרת: {q.chosenKey ? optionLetter(q.chosenKey) : "ללא תשובה"} · התשובה הנכונה: {q.correctKey ? optionLetter(q.correctKey) : ""}
                    </p>
                  </div>
                  <Link className="shrink-0 text-sm font-semibold text-accent" href={`/academy/attempts/${id}?q=${q.position}`}>לפתרון</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
