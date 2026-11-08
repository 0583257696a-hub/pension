import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import QuestionPractice from "@/components/academy/QuestionPractice";
import { btn } from "@/components/academy/ui";

/** Practice screen for one lesson (design 04). */
export default async function PracticeLesson({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/academy/practice/${slug}`);
  const view = await new LearningService(await getDb()).getLessonView(user, slug);
  if (!view) notFound();
  const crumbs = (
    <nav aria-label="פירורי לחם" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
      <Link href="/academy/practice" className="hover:text-ink">תרגול שאלות</Link>
      <span>‹</span>
      <span>{view.unit.title.replace(/^יחידה \d+: /, "")}</span>
      <span>‹</span>
      <span className="font-medium text-ink">{view.lesson.title.replace(/^שיעור \d+: /, "")}</span>
    </nav>
  );
  if (!view.allowed) {
    return (
      <div className="mx-auto max-w-[1000px]">
        {crumbs}
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="text-[15px] text-body">{view.reason === "subscription_required" ? "התרגול בנושא זה זמין למנויים ולמשתמשים בתקופת ניסיון." : "התרגול בנושא זה עדיין בהכנה."}</p>
          {view.reason === "subscription_required" && <Link href="/academy/account" className={`${btn.primary} mt-5`}>להתחלת תקופת ניסיון</Link>}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[1000px]">
      {crumbs}
      <QuestionPractice
        questions={view.practice}
        lessonId={view.lesson.id}
        contextLabel={`${view.unit.title.replace(/^יחידה \d+: /, "")} · ${view.lesson.title.replace(/^שיעור \d+: /, "")}`}
        staffPreview={view.staffPreview}
      />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={`/academy/lesson/${slug}`} className={btn.secondary}>חזרה לשיעור</Link>
        {view.quiz && view.quiz.count > 0 && <Link href={`/academy/quiz/${view.quiz.id}`} className={btn.dark}>למבחן הסיכום</Link>}
      </div>
    </div>
  );
}
