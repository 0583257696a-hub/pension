import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import ExampleSolution from "@/components/academy/ExampleSolution";
import Md from "@/components/academy/Md";
import QuestionPractice from "@/components/academy/QuestionPractice";
import TutorChat from "@/components/academy/TutorChat";
import VideoPlayer from "@/components/academy/VideoPlayer";
import { Badge, btn, Card } from "@/components/academy/ui";

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const view = await new LearningService(await getDb()).getLessonView(user, slug);
  if (!view) notFound();

  if (!view.allowed) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <div className="text-sm text-slate-500">{view.unit.title}</div>
        <h1 className="mt-1 text-2xl font-extrabold">{view.lesson.title}</h1>
        <p className="mt-2 text-slate-600">{view.lesson.description}</p>
        <div className="mt-6">
          {view.reason === "login_required" && (
            <Link className={btn.primary} href={`/academy/login?next=/academy/lesson/${slug}`}>התחברות לצפייה בשיעור</Link>
          )}
          {view.reason === "subscription_required" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">השיעור זמין למנויים ולמשתמשים בתקופת ניסיון.</p>
              <Link className={btn.primary} href="/academy/account">להתחלת תקופת ניסיון</Link>
            </div>
          )}
          {view.reason === "not_published" && <p className="text-sm text-slate-600">השיעור עדיין בהכנה ויפורסם לאחר בדיקה מקצועית.</p>}
        </div>
      </Card>
    );
  }

  const p = view.progress;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/academy/course" className="text-sm font-semibold text-brand-700">← {view.unit.title}</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">{view.lesson.title}</h1>
        <p className="mt-1 text-slate-600">{view.lesson.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{view.lesson.minutes} דקות</Badge>
          {view.lesson.access === "free" && <Badge tone="green">שיעור פתוח</Badge>}
          {p?.practice_done ? <Badge tone="green">התרגול הושלם</Badge> : null}
          {p?.quiz_passed ? <Badge tone="green">מבחן הסיכום עבר</Badge> : null}
          {view.staffPreview && <Badge tone="violet">תצוגה מקדימה, טרם פורסם</Badge>}
        </div>
      </div>

      <Card>
        {view.video ? (
          <VideoPlayer assetId={view.video.id} url={view.video.url} title={view.video.title} />
        ) : (
          <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">סרטון השיעור בהפקה. בינתיים אפשר ללמוד מהסיכום, מהדוגמאות ומהתרגול.</div>
        )}
      </Card>

      {view.objectives.length > 0 && (
        <Card>
          <h2 className="text-lg font-extrabold">מה נלמד</h2>
          <ul className="mt-2 list-disc space-y-1 ps-6 text-slate-700">{view.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-extrabold">סיכום לימודי</h2>
        <Md text={view.summary_md} />
      </Card>

      {view.formulas.length > 0 && (
        <Card>
          <h2 className="text-lg font-extrabold">נוסחאות</h2>
          <p className="mt-1 text-xs text-slate-500">הנוסחאות מסבירות את ההיגיון. בשאלות מבחן פותרים קודם במחשבון.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {view.formulas.map((f) => (
              <div key={f.name} className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-bold text-slate-900">{f.name}</div>
                <div className="ltr my-2 rounded-lg bg-slate-50 px-3 py-2 text-center font-mono text-base">{f.formula}</div>
                <div className="text-xs text-slate-600">{f.meaning}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {view.examples.length > 0 && (
        <Card>
          <h2 className="text-lg font-extrabold">דוגמאות פתורות</h2>
          <div className="mt-3 space-y-6">
            {view.examples.map((e) => (
              <div key={e.title}>
                <h3 className="mb-2 font-bold text-slate-900">{e.title}</h3>
                <ExampleSolution problem={e.problem_md} formula={e.solution_md} calculator={e.calculator} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-extrabold">תרגול</h2>
        <QuestionPractice questions={view.practice} lessonId={view.lesson.id} staffPreview={view.staffPreview} />
      </Card>

      {view.quiz && view.quiz.count > 0 && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold">מבחן סיכום</h2>
            <p className="text-sm text-slate-600">{view.quiz.count} שאלות. מעבר המבחן מסמן את השיעור כהושלם.</p>
          </div>
          <Link className={btn.primary} href={`/academy/quiz/${view.quiz.id}`}>למבחן הסיכום</Link>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 text-lg font-extrabold">שאלו את המורה AI על השיעור</h2>
        <p className="mb-3 text-sm text-slate-600">המורה מסביר קודם איך פותרים במחשבון, ומוסיף נוסחאות כשצריך.</p>
        <TutorChat lessonId={view.lesson.id} />
      </Card>

      {view.nextLesson && (
        <div className="flex justify-end">
          <Link className={btn.secondary} href={`/academy/lesson/${view.nextLesson.slug}`}>לשיעור הבא: {view.nextLesson.title} ←</Link>
        </div>
      )}
    </div>
  );
}
