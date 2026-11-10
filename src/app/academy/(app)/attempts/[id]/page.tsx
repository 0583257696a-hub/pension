import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AssignmentService } from "@/academy/services/assignments";
import { AccessDeniedError } from "@/academy/services/learning";
import AssignmentRunner from "@/components/academy/AssignmentRunner";

export default async function AttemptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q } = await searchParams;
  const user = await requireUser(`/academy/attempts/${id}`);
  let view;
  try {
    view = await new AssignmentService(await getDb()).attemptView(user, id);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      if (error.reason === "subscription_required") redirect("/academy/pricing");
      notFound();
    }
    throw error;
  }
  const submitted = view.attempt.status === "submitted";
  return (
    <AssignmentRunner
      key={`${id}-${q ?? ""}`}
      attemptId={id}
      title={view.assignment.title}
      lessonTitle={view.lesson.title}
      submitted={submitted}
      practice={view.attempt.kind === "practice"}
      solutionPolicy={view.assignment.solutionPolicy}
      startPosition={q ? Number(q) : view.attempt.currentPosition}
      questions={view.questions}
    />
  );
}
