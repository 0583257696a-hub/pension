import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AccessDeniedError, LearningService } from "@/academy/services/learning";
import QuizRunner from "@/components/academy/QuizRunner";
import { btn, Card, PageTitle } from "@/components/academy/ui";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/academy/quiz/${id}`);
  const service = new LearningService(await getDb());
  let view;
  try {
    view = await service.getQuizView(user, id);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return (
        <Card className="mx-auto max-w-lg text-center">
          <p className="text-slate-700">{error.message}</p>
          <Link className={`${btn.primary} mt-4`} href="/academy/account">לניהול המנוי</Link>
        </Card>
      );
    }
    throw error;
  }
  if (!view) notFound();
  const lessonIdByQuestion = Object.fromEntries(view.questions.map((q) => [q.id, q.lessonId]));
  const kindLabel = view.quiz.kind === "simulation" ? "סימולציה בתנאי מבחן" : view.quiz.kind === "unit" ? "מבחן פרק" : "מבחן סיכום";
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title={view.quiz.title}
        subtitle={`${kindLabel} · ${view.questions.length} שאלות${view.quiz.timeLimitMinutes ? ` · ${view.quiz.timeLimitMinutes} דקות` : ""}${view.lastAttempt ? ` · ציון קודם: ${view.lastAttempt.score}` : ""}`}
      />
      {view.questions.length === 0 ? (
        <Card>אין עדיין שאלות שאושרו למבחן זה.</Card>
      ) : (
        <QuizRunner quizId={view.quiz.id} questions={view.questions} timeLimitMinutes={view.quiz.timeLimitMinutes} passScore={view.quiz.passScore} lessonIdByQuestion={lessonIdByQuestion} />
      )}
    </div>
  );
}
