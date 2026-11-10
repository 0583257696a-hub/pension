import Link from "next/link";
import type { ReactNode } from "react";
import { IconCheck, IconChevronRight, IconLock } from "./icons";

interface NavLesson { number: number; slug: string; title: string; state: "not_started" | "in_progress" | "completed"; allowed: boolean }

/** Lesson frame: numbered lesson list beside the lesson. No AI panel (spec §13). */
export default function LessonFrame({ lessons, currentSlug, courseTitle, children }: {
  lessons: NavLesson[]; currentSlug: string; courseTitle: string; children: ReactNode;
}) {
  const done = lessons.filter((l) => l.state === "completed").length;
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 flex h-[60px] items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
        <Link href="/academy/course" className="flex shrink-0 items-center gap-1 text-sm font-medium text-ink">
          <IconChevronRight size={16} /> לכל השיעורים
        </Link>
        <span className="hidden h-5 w-px bg-line md:block" />
        <div className="hidden min-w-0 flex-1 truncate text-sm text-muted md:block">{courseTitle}</div>
      </header>
      <div className="flex flex-col-reverse lg:flex-row">
        <aside className="border-t border-line lg:sticky lg:top-[60px] lg:h-[calc(100vh-60px)] lg:w-[300px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="border-b border-line px-5 py-4">
            <div className="text-[15px] font-bold">שיעורי הקורס</div>
            <div className="mt-1 text-[13px] text-muted">הושלמו {done} מתוך {lessons.length}</div>
          </div>
          <ol className="py-2">
            {lessons.map((l) => {
              const current = l.slug === currentSlug;
              const row = (
                <span className={`mx-3 flex items-start gap-3 rounded-md px-3 py-2.5 text-sm ${current ? "bg-accent-soft font-semibold text-ink" : l.allowed ? "text-body hover:bg-surface" : "text-faint"}`}>
                  <span className="mt-0.5 flex w-5 shrink-0 justify-center">
                    {l.state === "completed" ? <IconCheck size={16} className="text-success" /> : !l.allowed ? <IconLock size={14} /> : <span className="text-xs font-bold">{l.number}</span>}
                  </span>
                  <span className="flex-1 leading-snug">{l.title}</span>
                </span>
              );
              return <li key={l.slug}>{l.allowed ? <Link href={`/academy/lesson/${l.slug}`} aria-current={current ? "page" : undefined}>{row}</Link> : row}</li>;
            })}
          </ol>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-10">
          <div className="mx-auto max-w-[820px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
