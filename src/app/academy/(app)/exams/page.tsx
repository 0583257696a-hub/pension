import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { IconLock, IconTarget, IconTimer } from "@/components/academy/icons";
import { Badge, PageTitle } from "@/components/academy/ui";

const KIND: Record<string, string> = { lesson: "מבחן סיכום", unit: "מבחן פרק", simulation: "סימולציה" };

/** Lesson quizzes, unit exams and timed simulations. */
export default async function ExamsPage() {
  const user = await requireUser("/academy/exams");
  const quizzes = await new LearningService(await getDb()).listQuizzes(user);
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageTitle title="מבחנים וסימולציות" subtitle="מבחני סיכום לכל שיעור, מבחני פרק וסימולציות בתנאי בחינה עם שעון." />
      {quizzes.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-[15px] text-muted">המבחנים יפורסמו יחד עם השיעורים.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((q) => {
            const body = (
              <div className="flex h-full flex-col gap-3 rounded-xl border border-line bg-white p-5 hover:border-input">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">{q.kind === "simulation" ? <IconTimer /> : <IconTarget />}</span>
                  <Badge tone={q.kind === "simulation" ? "dark" : "slate"}>{KIND[q.kind]}</Badge>
                </div>
                <div className="text-[15px] font-bold text-ink">{q.title.replace(/^(מבחן סיכום|מבחן פרק|סימולציה בתנאי מבחן): /, "")}</div>
                <div className="text-[13px] text-muted">{q.count} שאלות{q.timeLimit ? ` · ${q.timeLimit} דקות` : ""} · ציון עובר {q.passScore}</div>
                <div className="mt-auto flex items-center justify-between pt-2 text-[13px]">
                  {q.last ? <Badge tone={q.last.passed ? "green" : "amber"}>ציון אחרון {q.last.score}</Badge> : <span className="text-muted">טרם נבחנת</span>}
                  {!q.allowed && <span className="flex items-center gap-1 text-muted"><IconLock size={14} /> למנויים</span>}
                </div>
              </div>
            );
            return <li key={q.id}>{q.allowed ? <Link href={`/academy/quiz/${q.id}`} className="block h-full">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
