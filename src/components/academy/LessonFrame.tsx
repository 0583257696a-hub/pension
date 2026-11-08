"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { IconChevronRight, IconSparkle, IconX } from "./icons";
import TutorChat from "./TutorChat";

/** Lesson player frame (design 03): course tree · lesson · AI tutor panel. */
export default function LessonFrame({ breadcrumb, courseNav, children, lessonId, tutorContext }: {
  breadcrumb: ReactNode; courseNav: ReactNode; children: ReactNode; lessonId: string; tutorContext: string;
}) {
  const [tutorOpen, setTutorOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 flex h-[60px] items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
        <Link href="/academy/dashboard" className="flex shrink-0 items-center gap-1 text-sm font-medium text-ink">
          <IconChevronRight size={16} /> חזרה ללוח הבקרה
        </Link>
        <span className="hidden h-5 w-px bg-line md:block" />
        <div className="hidden min-w-0 flex-1 truncate text-sm text-muted md:block">{breadcrumb}</div>
        <div className="mr-auto flex items-center gap-2">
          <button type="button" onClick={() => setNavOpen((v) => !v)} className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-semibold lg:hidden" aria-expanded={navOpen}>
            תוכן הקורס
          </button>
          <button
            type="button"
            onClick={() => setTutorOpen((v) => !v)}
            aria-expanded={tutorOpen}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-3.5 text-sm font-semibold text-accent-hover"
          >
            <IconSparkle size={16} /> המורה AI
          </button>
        </div>
      </header>
      <div className="flex flex-col lg:flex-row">
        <aside className={`${navOpen ? "block" : "hidden"} border-b border-line lg:sticky lg:top-[60px] lg:block lg:h-[calc(100vh-60px)] lg:w-[300px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-l`}>
          {courseNav}
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-10">
          <div className="mx-auto max-w-[760px]">{children}</div>
        </main>
        {tutorOpen && (
          <aside className="flex flex-col border-t border-line bg-surface lg:sticky lg:top-[60px] lg:h-[calc(100vh-60px)] lg:w-[340px] lg:shrink-0 lg:border-r lg:border-t-0">
            <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
              <span className="flex items-center gap-2 text-[15px] font-bold">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft"><IconSparkle size={16} /></span>
                המורה AI
              </span>
              <button type="button" aria-label="סגירת המורה" onClick={() => setTutorOpen(false)} className="text-muted hover:text-ink"><IconX size={18} /></button>
            </div>
            <div className="border-b border-line px-5 py-2.5 text-xs text-muted">ההקשר: {tutorContext}</div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <TutorChat lessonId={lessonId} compact />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
