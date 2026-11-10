import { notFound } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AccessDeniedError } from "@/academy/services/learning";
import { HELP_STATUS_LABEL, HelpService } from "@/academy/services/help";
import HelpReply from "@/components/academy/HelpReply";
import { Badge, optionLetter, PageTitle } from "@/components/academy/ui";

export default async function HelpThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/academy/help/${id}`);
  let thread;
  try {
    thread = await new HelpService(await getDb()).thread(user, id);
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  const { request, messages } = thread;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageTitle title={`פנייה: ${request.assignment_title ?? "מטלה"}, שאלה ${request.question_position ?? ""}`} subtitle={request.lesson_title ?? undefined} actions={<Badge tone="blue">{HELP_STATUS_LABEL[request.status]}</Badge>} />
      {request.stem && (
        <div className="rounded-xl border border-line bg-surface p-4 text-[15px] text-body">
          <div className="text-sm text-muted">השאלה{request.chosen_key ? ` · בחרת ${optionLetter(request.chosen_key)}` : ""}</div>
          <p className="mt-1">{request.stem}</p>
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {messages.map((m) => (
          <li key={m.id} className={`rounded-xl border p-4 ${m.author_kind === "staff" ? "border-accent-line bg-accent-soft" : "border-line bg-white"}`}>
            <div className="text-xs text-muted">{m.author_kind === "staff" ? `צוות האקדמיה${m.author_name ? ` · ${m.author_name}` : ""}` : "את/ה"} · {new Date(m.created_at).toLocaleString("he-IL")}</div>
            <p className="mt-1 whitespace-pre-wrap text-[15px] text-ink">{m.body}</p>
          </li>
        ))}
      </ol>
      {request.status !== "closed" && <HelpReply requestId={request.id} staff={false} />}
    </div>
  );
}
