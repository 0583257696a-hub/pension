import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { PDF_KIND_LABEL } from "@/academy/pdf/lesson-documents";
import { LearningService, LESSON_STATE_LABEL } from "@/academy/services/learning";
import ExampleSolution from "@/components/academy/ExampleSolution";
import { IconChevronLeft, IconDownload, IconFile, IconLock } from "@/components/academy/icons";
import LessonFrame from "@/components/academy/LessonFrame";
import LessonVideo from "@/components/academy/LessonVideo";
import Md from "@/components/academy/Md";
import { Badge, btn } from "@/components/academy/ui";

const sizeLabel = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Lesson page (spec §7, §32): header · PDFs above the video · video · lesson questions · homework. */
export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/academy/lesson/${slug}`);
  const service = new LearningService(await getDb());
  const view = await service.getLessonView(user, slug);
  if (!view) notFound();
  const syllabus = await service.getSyllabus(user, view.courseId);
  const lessons = (syllabus?.lessons ?? []).filter((l) => l.available).map((l) => ({ number: l.number, slug: l.slug, title: l.title, state: l.state, allowed: l.allowed }));
  const courseTitle = syllabus?.course.title ?? "";

  const header = (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        {view.lesson.chapters.map((c) => <span key={c.number}>פרק {c.number}: {c.title}</span>)}
        {view.lesson.minutes ? <span>· כ-{view.lesson.minutes} דקות</span> : null}
        {"progress" in view && <span>· {LESSON_STATE_LABEL[view.assignment?.grade ? "completed" : view.progress ? "in_progress" : "not_started"]}</span>}
        {"staffPreview" in view && view.staffPreview && <Badge tone="amber">תצוגה מקדימה, טרם פורסם</Badge>}
      </div>
      <h1 className="mt-2 text-[26px] font-bold leading-tight text-ink sm:text-[32px]">{view.lesson.title}</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-muted">{view.lesson.description}</p>
      {view.lesson.topics.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {view.lesson.topics.map((t) => <li key={t} className="rounded-md bg-line-soft px-2.5 py-1 text-[13px] text-subtle">{t}</li>)}
        </ul>
      )}
    </div>
  );

  if (!view.allowed) {
    return (
      <LessonFrame lessons={lessons} currentSlug={slug} courseTitle={courseTitle}>
        {header}
        <div className="mt-8 rounded-xl border border-line p-8 text-center">
          <IconLock size={22} className="mx-auto text-muted" />
          {view.reason === "subscription_required" && (
            <>
              <p className="mt-3 text-[15px] text-body">השיעור, קובצי ה-PDF והמטלה פתוחים לתלמידים שרכשו את הקורס.</p>
              <Link className={`${btn.primary} mt-4`} href="/academy/pricing">לרכישת הקורס</Link>
            </>
          )}
          {view.reason === "not_published" && <p className="mt-3 text-[15px] text-body">השיעור בהכנה ויפורסם לאחר בדיקה מקצועית.</p>}
        </div>
      </LessonFrame>
    );
  }

  return (
    <LessonFrame lessons={lessons} currentSlug={slug} courseTitle={courseTitle}>
      {header}

      {/* Materials ABOVE the video (spec §7.2). */}
      <section aria-labelledby="materials" className="mt-6">
        <h2 id="materials" className="sr-only">חומרי השיעור</h2>
        {view.materials.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {view.materials.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"><IconFile size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-ink">{m.kind === "supplement_pdf" ? m.title : `${PDF_KIND_LABEL[m.kind as keyof typeof PDF_KIND_LABEL]} — PDF`}</div>
                  <div className="text-xs text-muted">גרסה {m.version} · {sizeLabel(m.sizeBytes)}{m.draft ? " · טיוטה (צוות בלבד)" : ""}</div>
                </div>
                <a href={`/api/academy/materials/${m.id}`} target="_blank" rel="noopener" className="text-sm font-semibold text-accent">צפייה</a>
                <a href={`/api/academy/materials/${m.id}?download=1`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink" aria-label={`הורדת ${m.title}`}>
                  <IconDownload size={16} /> הורדה
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">קובצי השיעור (שאלות השיעור ודף נוסחאות) יתווספו כאן לאחר אישורם.</p>
        )}
      </section>

      <div className="mt-6">
        {view.video ? (
          <LessonVideo assetId={view.video.id} url={view.video.url} title={view.video.title} chapters={view.videoChapters} checkpoints={view.checkpoints} />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl bg-[#0B1220] px-6 text-center text-white">
            <span className="text-lg font-semibold">סרטון השיעור בהפקה</span>
            <span className="max-w-md text-sm text-white/70">הסרטון יפורסם לאחר בדיקה מקצועית. בינתיים אפשר לעבור על שאלות השיעור והפתרונות שלהן למטה.</span>
          </div>
        )}
      </div>

      {/* Homework (spec §7.5) */}
      {view.assignment && (
        <section className="mt-6 flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[16px] font-bold text-ink">{view.assignment.title} — {view.assignment.questionCount || 20} שאלות</div>
            <div className="mt-1 text-sm text-muted">
              {view.assignment.grade
                ? `הוגשה. ענית נכון על ${view.assignment.grade.correct} מתוך ${view.assignment.grade.total} · ציון ${view.assignment.grade.score}`
                : view.assignment.published ? "שאלות אמריקאיות קבועות, עם פתרון וסרטון הסבר לכל שאלה." : "המטלה עוד לא פורסמה (תצוגת צוות)."}
            </div>
          </div>
          <div className="flex gap-2">
            {view.assignment.grade && <Link className={btn.secondary} href={`/academy/attempts/${view.assignment.grade.attemptId}/results`}>לתוצאות</Link>}
            <Link className={btn.dark} href={`/academy/assignments/${view.assignment.id}`}>
              {view.assignment.grade ? "לתרגול נוסף" : `למטלה ${view.assignment.number}`} <IconChevronLeft size={16} />
            </Link>
          </div>
        </section>
      )}

      {/* Lesson questions: the same questions, numbering and order as the PDF and the video (spec §7.4). */}
      {view.examples.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-ink">שאלות השיעור</h2>
          <p className="mt-1 text-sm text-muted">אלה השאלות שנפתרות בסרטון. נסו לפתור לבד, ואז פתחו את הפתרון.</p>
          <ol className="mt-4 flex flex-col gap-4">
            {view.examples.map((e, i) => (
              <li key={e.title}>
                <details className="group rounded-xl border border-line">
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-line-soft text-sm font-bold">{i + 1}</span>
                    <span className="flex-1 text-[15px] text-ink">{e.title.replace(/^שאלה\s+\d+\s*:\s*/, "")}</span>
                    <span className="text-sm font-semibold text-accent group-open:hidden">פתרון</span>
                  </summary>
                  <div className="border-t border-line p-4">
                    <ExampleSolution problem={e.problem_md} formula={e.solution_md} calculator={e.calculator} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}

      {view.summary_md && (
        <section className="mt-10">
          <details className="rounded-xl border border-line">
            <summary className="cursor-pointer list-none p-4 text-[16px] font-bold text-ink">סיכום השיעור</summary>
            <div className="border-t border-line p-5">
              <Md text={view.summary_md} className="text-[16px] leading-[1.85] !text-body" />
            </div>
          </details>
        </section>
      )}

      <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-line pt-6">
        {view.prevLesson ? <Link href={`/academy/lesson/${view.prevLesson.slug}`} className={btn.secondary}>לשיעור הקודם</Link> : <span />}
        {view.nextLesson && (
          <Link href={view.nextLesson.allowed ? `/academy/lesson/${view.nextLesson.slug}` : "/academy/pricing"} className={btn.dark}>
            לשיעור הבא <IconChevronLeft size={16} />
          </Link>
        )}
      </div>
    </LessonFrame>
  );
}
