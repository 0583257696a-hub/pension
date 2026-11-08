import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { IconCheckSquare, IconChevronLeft, IconPlay, IconSparkle, IconTarget, IconTimer } from "@/components/academy/icons";
import { Card, CardTitle } from "@/components/academy/ui";

function relativeDay(iso: string): string {
  const day = new Date(iso);
  const today = new Date();
  const diff = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())) / 86400_000);
  if (diff <= 0) return "היום";
  if (diff === 1) return "אתמול";
  return `לפני ${diff} ימים`;
}

function accuracyTone(value: number) {
  return value < 50 ? "text-danger-ink" : value < 70 ? "text-warn-ink" : "text-success-ink";
}

/** Student dashboard (design 02). Everything shown is computed from the student's own records. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ forbidden?: string }> }) {
  const user = await requireUser("/academy/dashboard");
  const { forbidden } = await searchParams;
  const data = await new LearningService(await getDb()).getDashboardInsights(user);
  if (!data) return <p>הקורס עדיין לא הוגדר.</p>;

  const published = data.units.flatMap((u) => u.lessons).filter((l) => l.status === "published");
  const pct = data.stats.publishedLessons ? Math.round((data.stats.completedLessons / data.stats.publishedLessons) * 100) : 0;
  const remaining = data.stats.publishedLessons - data.stats.completedLessons - data.lessonsInProgress;
  const weakest = data.weakTopics[0];
  const today = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  const simulation = data.exams.find((e) => e.kind === "simulation");

  const nextSteps = [
    ...(weakest ? [{ href: `/academy/practice/${weakest.slug}`, icon: <IconCheckSquare />, title: `תרגול ממוקד: ${weakest.title}`, sub: `דיוק נוכחי ${weakest.accuracy}%` }] : []),
    ...(data.nextQuiz ? [{ href: `/academy/quiz/${data.nextQuiz.id}`, icon: <IconTarget />, title: data.nextQuiz.title.replace("מבחן סיכום: ", "מבחן סיכום · "), sub: "מעבר המבחן מסמן את השיעור כהושלם" }] : []),
    ...(simulation ? [{ href: `/academy/quiz/${simulation.id}`, icon: <IconTimer />, title: "סימולציה בתנאי מבחן", sub: `${simulation.count} שאלות · ${simulation.timeLimit ?? ""} דקות` }] : []),
  ].slice(0, 3);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      {forbidden && <p className="rounded-md border border-warn bg-warn-soft px-4 py-3 text-sm text-warn-ink">אין לך הרשאה לאזור הניהול.</p>}
      <div>
        <div className="text-sm text-muted">{today}</div>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-tight text-ink sm:text-[32px]">{user.full_name ? `שלום ${user.full_name.split(" ")[0]}, ממשיכים להתקדם.` : "ברוך הבא, ממשיכים להתקדם."}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        {data.next ? (
          <section className="flex flex-col gap-6 rounded-xl bg-dark p-6 text-white sm:flex-row sm:p-8">
            <div className="flex flex-1 flex-col">
              <div className="text-sm text-faint">המשך מהמקום שעצרת</div>
              <div className="mt-3 text-sm text-[#D0D5DD]">{data.course.title} · {data.nextUnit?.title ?? data.next.unitTitle}</div>
              <h2 className="mt-2 text-2xl font-bold leading-snug sm:text-[28px]">{data.next.title}</h2>
              {data.nextUnit && (
                <div className="mt-6 flex flex-col gap-2">
                  <div className="flex justify-between text-sm text-[#D0D5DD]">
                    <span>התקדמות ביחידה</span>
                    <span className="ltr">{data.nextUnit.completed} / {data.nextUnit.total}</span>
                  </div>
                  <div className="h-1 rounded bg-white/20"><div className="h-1 rounded bg-white" style={{ width: `${data.nextUnit.total ? (data.nextUnit.completed / data.nextUnit.total) * 100 : 0}%` }} /></div>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/academy/lesson/${data.next.slug}`} className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-[15px] font-semibold text-ink"><IconPlay size={14} /> המשך שיעור</Link>
                <Link href="/academy/course" className="inline-flex h-11 items-center rounded-md border border-white/30 px-5 text-[15px] font-semibold text-white hover:bg-white/5">לכל הפרקים</Link>
              </div>
            </div>
          </section>
        ) : data.lockedNext ? (
          <section className="flex flex-col rounded-xl bg-dark p-6 text-white sm:p-8">
            <div className="text-sm text-faint">השיעור הבא שלך</div>
            <div className="mt-3 text-sm text-[#D0D5DD]">{data.course.title} · {data.lockedNext.unitTitle}</div>
            <h2 className="mt-2 text-2xl font-bold leading-snug sm:text-[28px]">{data.lockedNext.title}</h2>
            <p className="mt-3 text-[15px] text-[#D0D5DD]">השיעורים הבאים זמינים במנוי. אפשר להתחיל תקופת ניסיון של {data.course.trial_days} ימים.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/academy/account" className="inline-flex h-11 items-center rounded-md bg-white px-5 text-[15px] font-semibold text-ink">להתחלת תקופת ניסיון</Link>
              <Link href="/academy/course" className="inline-flex h-11 items-center rounded-md border border-white/30 px-5 text-[15px] font-semibold text-white hover:bg-white/5">לכל הפרקים</Link>
            </div>
          </section>
        ) : (
          <section className="rounded-xl bg-dark p-8 text-white">
            <h2 className="text-2xl font-bold">{data.stats.publishedLessons ? "סיימת את כל השיעורים הפתוחים" : "השיעורים יפורסמו בקרוב"}</h2>
            <p className="mt-2 text-faint">אפשר לחזור על נושאים, לתרגל ולהיבחן בסימולציה.</p>
            <Link href="/academy/exams" className="mt-6 inline-flex h-11 items-center rounded-md bg-white px-5 text-[15px] font-semibold text-ink">למבחנים ולסימולציות</Link>
          </section>
        )}

        <section className="flex flex-col rounded-xl border border-accent-line bg-gradient-to-b from-accent-tint to-white p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent"><IconSparkle size={16} /> המלצת המורה AI</div>
          {weakest ? (
            <>
              <h3 className="mt-3 text-xl font-bold leading-snug">מומלץ לחזור על {weakest.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">ענית נכון על {weakest.correct} מתוך {weakest.total} השאלות בנושא הזה.</p>
              <div className="mt-auto flex items-center gap-3 pt-6">
                <Link href={`/academy/practice/${weakest.slug}`} className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-hover">בוא נתרגל</Link>
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-3 text-xl font-bold leading-snug">יש שאלה על החומר?</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">המורה AI מכיר כל שיעור ומסביר קודם איך פותרים במחשבון הפיננסי.</p>
              {data.next && (
                <div className="mt-auto pt-6">
                  <Link href={`/academy/lesson/${data.next.slug}`} className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-hover">שאלו את המורה</Link>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardTitle>התקדמות בלימודים</CardTitle>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted">השלמת קורס</span>
              <span className="ltr text-start text-4xl font-bold">{pct}%</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted">דיוק · 7 ימים</span>
              <span className="ltr text-start text-4xl font-bold">{data.weekAccuracy === null ? "—" : `${data.weekAccuracy}%`}</span>
            </div>
          </div>
          <div className="mt-6 flex gap-1" aria-hidden="true">
            {published.map((l) => (
              <span key={l.id} className={`h-2 flex-1 rounded-sm ${l.progress?.completed ? "bg-dark" : l.progress ? "bg-subtle" : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            {data.stats.completedLessons} שיעורים הושלמו · {data.lessonsInProgress} בתהליך · {Math.max(0, remaining)} נותרו
          </p>
        </Card>

        <Card>
          <CardTitle action={<Link href="/academy/practice" className="text-sm font-semibold text-accent">לכל הנושאים</Link>}>נושאים לחזרה</CardTitle>
          {data.weakTopics.length ? (
            <ul className="divide-y divide-line-soft">
              {data.weakTopics.map((t) => (
                <li key={t.lesson_id}>
                  <Link href={`/academy/practice/${t.slug}`} className="flex items-center justify-between gap-3 py-3.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink">{t.title.replace(/^שיעור \d+: /, "")}</span>
                      <span className="block truncate text-[13px] text-muted">{t.total} שאלות · {t.unit_title.replace(/^יחידה \d+: /, "")}</span>
                    </span>
                    <span className={`ltr text-sm font-bold ${accuracyTone(t.accuracy)}`}>{t.accuracy}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] leading-relaxed text-muted">עוד אין מספיק תרגול כדי לזהות נושאים לחיזוק. נושא יופיע כאן כשהדיוק בו נמוך מ-80%.</p>
          )}
        </Card>

        <Card>
          <CardTitle>הצעדים הבאים</CardTitle>
          {nextSteps.length ? (
            <ul className="flex flex-col gap-3">
              {nextSteps.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="flex items-center gap-3.5 rounded-md border border-line p-3.5 hover:border-input">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">{s.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{s.title}</span>
                      <span className="block truncate text-[13px] text-muted">{s.sub}</span>
                    </span>
                    <IconChevronLeft size={16} className="text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">כשיתפרסמו שיעורים ומבחנים, הצעדים הבאים יופיעו כאן.</p>
          )}
        </Card>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-lg font-bold">פעילות אחרונה</h2>
        </div>
        {data.activity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[15px]">
              <thead className="border-y border-line bg-surface text-[13px] text-muted">
                <tr>
                  <th className="px-6 py-3 text-start font-medium">פעילות</th>
                  <th className="px-6 py-3 text-start font-medium">נושא</th>
                  <th className="px-6 py-3 text-start font-medium">תוצאה</th>
                  <th className="px-6 py-3 text-start font-medium">מתי</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data.activity.map((a, i) => (
                  <tr key={i}>
                    <td className="px-6 py-3.5 font-semibold">{a.title}</td>
                    <td className="px-6 py-3.5 text-subtle">{a.topic}</td>
                    <td className="px-6 py-3.5">
                      {a.kind === "quiz" ? (
                        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${a.passed ? "bg-success-soft text-success-ink" : "bg-warn-soft text-warn-ink"}`}>
                          <span className="ltr">{a.result}</span> · {a.passed ? "עבר" : "לא עבר"}
                        </span>
                      ) : (
                        <span className="ltr">{a.result}</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-muted">{relativeDay(a.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border-t border-line px-6 py-5 text-[15px] text-muted">עדיין אין פעילות. אפשר להתחיל מהשיעור הראשון.</p>
        )}
      </section>
    </div>
  );
}
