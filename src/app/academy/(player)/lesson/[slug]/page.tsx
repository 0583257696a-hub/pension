import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import ExampleSolution from "@/components/academy/ExampleSolution";
import { IconCheck, IconChevronDown, IconChevronLeft, IconLock, IconPlay } from "@/components/academy/icons";
import LessonFrame from "@/components/academy/LessonFrame";
import LessonTabs from "@/components/academy/LessonTabs";
import Md from "@/components/academy/Md";
import VideoPlayer from "@/components/academy/VideoPlayer";
import { btn } from "@/components/academy/ui";

const short = (title: string) => title.replace(/^(שיעור|יחידה) \d+: /, "");

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/academy/lesson/${slug}`);
  const service = new LearningService(await getDb());
  const view = await service.getLessonView(user, slug);
  if (!view) notFound();
  const syllabus = await service.getSyllabus(user);

  const units = syllabus?.units ?? [];
  const allLessons = units.flatMap((u) => u.lessons.filter((l) => l.available));
  const completed = allLessons.filter((l) => l.progress?.completed).length;
  const coursePct = allLessons.length ? Math.round((completed / allLessons.length) * 100) : 0;
  const unitIndex = units.findIndex((u) => u.id === view.unit.id);
  const unitLessons = units[unitIndex]?.lessons.filter((l) => l.available) ?? [];
  const lessonIndex = unitLessons.findIndex((l) => l.slug === slug);
  const flatIndex = allLessons.findIndex((l) => l.slug === slug);
  const prev = flatIndex > 0 ? allLessons[flatIndex - 1] : null;

  const courseNav = (
    <div>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-5">
        <span className="text-[15px] font-bold">תוכן הקורס</span>
        <div className="flex justify-between text-[13px] text-muted">
          <span>הושלמו {completed} מתוך {allLessons.length} שיעורים</span>
          <span className="ltr">{coursePct}%</span>
        </div>
        <div className="h-1 rounded bg-line"><div className="h-1 rounded bg-dark" style={{ width: `${coursePct}%` }} /></div>
      </div>
      <ol>
        {units.map((unit, ui) => {
          const open = unit.id === view.unit.id;
          const lessons = unit.lessons;
          const done = lessons.filter((l) => l.progress?.completed).length;
          return (
            <li key={unit.id} className="border-b border-line">
              <details open={open} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[15px]">
                  <IconChevronDown size={16} className="shrink-0 text-muted transition-transform group-[:not([open])]:-rotate-90" />
                  <span className={`flex-1 ${open ? "font-bold" : ""}`}>פרק {ui + 1}: {short(unit.title)}</span>
                  <span className="ltr text-[13px] text-muted">{done}/{lessons.length}</span>
                </summary>
                <ol className="pb-2">
                  {lessons.map((l, li) => {
                    const current = l.slug === slug;
                    const icon = l.progress?.completed ? (
                      <IconCheck size={16} className="text-success" />
                    ) : current ? (
                      <IconPlay size={12} className="text-accent" />
                    ) : !l.available || !l.allowed ? (
                      <IconLock size={14} className="text-faint" />
                    ) : (
                      <span className="block h-4 w-4 rounded-full border border-input" />
                    );
                    const row = (
                      <span className={`mx-3 flex items-start gap-3 rounded-md px-3 py-2.5 text-sm ${current ? "bg-accent-soft font-semibold text-ink" : l.available ? "text-body hover:bg-surface" : "text-faint"}`}>
                        <span className="mt-0.5 flex w-4 shrink-0 justify-center">{icon}</span>
                        <span className="flex-1 leading-snug">{ui + 1}.{li + 1} {short(l.title)}</span>
                        <span className="ltr shrink-0 text-xs text-muted">{l.available ? `${l.minutes}′` : "בקרוב"}</span>
                      </span>
                    );
                    return <li key={l.id}>{l.available ? <Link href={`/academy/lesson/${l.slug}`} aria-current={current ? "page" : undefined}>{row}</Link> : row}</li>;
                  })}
                </ol>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );

  const breadcrumb = (
    <span>
      {syllabus?.course.title} <span className="mx-1.5">‹</span> פרק {unitIndex + 1}: {short(view.unit.title)} <span className="mx-1.5">‹</span>
      <span className="font-semibold text-ink">שיעור {lessonIndex + 1}</span>
    </span>
  );

  if (!view.allowed) {
    return (
      <LessonFrame breadcrumb={breadcrumb} courseNav={courseNav} lessonId={view.lesson.id} tutorContext={short(view.lesson.title)}>
        <div className="rounded-xl border border-line p-8 text-center">
          <IconLock size={22} className="mx-auto text-muted" />
          <h1 className="mt-3 text-2xl font-bold">{view.lesson.title}</h1>
          <p className="mt-2 text-[15px] text-muted">{view.lesson.description}</p>
          {view.reason === "subscription_required" && (
            <>
              <p className="mt-5 text-[15px] text-body">השיעור זמין למנויים ולמשתמשים בתקופת ניסיון.</p>
              <Link className={`${btn.primary} mt-4`} href="/academy/account">להתחלת תקופת ניסיון</Link>
            </>
          )}
          {view.reason === "not_published" && <p className="mt-5 text-[15px] text-body">השיעור בהכנה ויפורסם לאחר בדיקה מקצועית.</p>}
        </div>
      </LessonFrame>
    );
  }

  const mainFormula = view.formulas[0];
  const p = view.progress;

  const tabs = [
    {
      id: "summary",
      label: "סיכום",
      content: (
        <div className="flex flex-col gap-6">
          <Md text={view.summary_md} className="text-[17px] leading-[1.85] !text-body" />
          {view.objectives.length > 0 && (
            <div className="rounded-xl border border-line p-6">
              <h3 className="mb-3 text-[15px] font-bold">נקודות מפתח</h3>
              <ul className="flex flex-col gap-2 text-[15px] text-body">
                {view.objectives.map((o) => <li key={o}>• {o}</li>)}
              </ul>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "formulas",
      label: "נוסחאות",
      content: (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">הנוסחאות מסבירות את ההיגיון. בשאלות מבחן פותרים קודם במחשבון.</p>
          {view.formulas.map((f) => (
            <div key={f.name} className="rounded-xl border border-line p-5">
              <div className="text-[15px] font-semibold">{f.name}</div>
              <div className="ltr my-3 rounded-md bg-surface px-4 py-3 text-center font-mono text-lg">{f.formula}</div>
              <div className="text-[13px] text-muted">{f.meaning}</div>
            </div>
          ))}
        </div>
      ),
    },
    ...(view.examples.length
      ? [{
          id: "examples",
          label: "דוגמאות",
          content: (
            <div className="flex flex-col gap-8">
              {view.examples.map((e) => (
                <div key={e.title}>
                  <h3 className="mb-3 text-lg font-bold">{e.title}</h3>
                  <ExampleSolution problem={e.problem_md} formula={e.solution_md} calculator={e.calculator} />
                </div>
              ))}
            </div>
          ),
        }]
      : []),
    {
      id: "practice",
      label: "תרגול קשור",
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-xl border border-line p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[15px] font-bold">תרגול שאלות</div>
              <div className="mt-1 text-[13px] text-muted">{view.practice.length} שאלות בסגנון הבחינה, עם פתרון במחשבון אחרי כל תשובה.{p?.practice_done ? " · התרגול הושלם" : ""}</div>
            </div>
            <Link href={`/academy/practice/${slug}`} className={btn.primary}>לתרגול</Link>
          </div>
          {view.quiz && view.quiz.count > 0 && (
            <div className="flex flex-col gap-4 rounded-xl border border-line p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[15px] font-bold">מבחן סיכום</div>
                <div className="mt-1 text-[13px] text-muted">{view.quiz.count} שאלות. מעבר המבחן מסמן את השיעור כהושלם.{p?.quiz_passed ? " · עברת" : ""}</div>
              </div>
              <Link href={`/academy/quiz/${view.quiz.id}`} className={btn.dark}>למבחן</Link>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <LessonFrame breadcrumb={breadcrumb} courseNav={courseNav} lessonId={view.lesson.id} tutorContext={`שיעור ${unitIndex + 1}.${lessonIndex + 1}`}>
      {view.video ? (
        <VideoPlayer assetId={view.video.id} url={view.video.url} title={view.video.title} />
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-5 rounded-md bg-[#0B1220] px-6 text-center text-white">
          {mainFormula && (
            <>
              <span className="text-sm text-brand-300">{mainFormula.name}</span>
              <span className="ltr text-2xl sm:text-4xl" style={{ fontFamily: "'Times New Roman', serif" }}>{mainFormula.formula}</span>
            </>
          )}
          <span className="text-sm text-faint">סרטון השיעור בהפקה. בינתיים אפשר ללמוד מהסיכום, מהדוגמאות ומהתרגול.</span>
        </div>
      )}

      <div className="mt-6 text-[13px] text-muted">
        פרק {unitIndex + 1} · שיעור {lessonIndex + 1} מתוך {unitLessons.length} · {view.lesson.minutes} דקות
        {view.staffPreview && <span className="mr-2 rounded-md bg-accent-soft px-2 py-0.5 text-accent">תצוגה מקדימה, טרם פורסם</span>}
      </div>
      <h1 className="mt-2 text-[28px] font-bold leading-tight sm:text-[32px]">{short(view.lesson.title)}</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">{view.lesson.description}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {prev && <Link href={`/academy/lesson/${prev.slug}`} className={btn.secondary}>השיעור הקודם</Link>}
        {view.nextLesson && (
          <Link href={`/academy/lesson/${view.nextLesson.slug}`} className={btn.dark}>לשיעור הבא <IconChevronLeft size={16} /></Link>
        )}
      </div>
      <div className="mt-8">
        <LessonTabs tabs={tabs} />
      </div>
    </LessonFrame>
  );
}
