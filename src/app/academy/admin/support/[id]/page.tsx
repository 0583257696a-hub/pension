import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AccessDeniedError } from "@/academy/services/learning";
import { HELP_STATUS_LABEL, HelpService } from "@/academy/services/help";
import HelpReply from "@/components/academy/HelpReply";
import HelpStatusButtons from "@/components/academy/admin/HelpStatusButtons";
import { Badge, Card, optionLetter } from "@/components/academy/ui";

export default async function SupportThread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaff();
  let thread;
  try {
    thread = await new HelpService(await getDb()).thread(me, id);
  } catch (error) {
    if (error instanceof AccessDeniedError) notFound();
    throw error;
  }
  const { request: r, messages } = thread;
  return (
    <div className="space-y-4">
      <Card>
        <Link href="/academy/admin/support" className="text-sm text-muted">← פניות תלמידים</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-extrabold">{r.full_name || r.email}</h1>
          <Badge tone="blue">{HELP_STATUS_LABEL[r.status]}</Badge>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">קורס: </dt><dd className="inline">{r.course_title}</dd></div>
          <div><dt className="inline text-muted">שיעור: </dt><dd className="inline">{r.lesson_title}</dd></div>
          <div><dt className="inline text-muted">מטלה: </dt><dd className="inline">{r.assignment_title}</dd></div>
          <div><dt className="inline text-muted">שאלה: </dt><dd className="inline">{r.question_position} · <span className="ltr">{r.question_id}</span> · גרסה {r.question_version}</dd></div>
          <div><dt className="inline text-muted">תשובה שנבחרה: </dt><dd className="inline">{r.chosen_key ? optionLetter(r.chosen_key) : "לא נבחרה"}</dd></div>
          <div><dt className="inline text-muted">אימייל: </dt><dd className="ltr inline">{r.email}</dd></div>
        </dl>
        {r.stem && <p className="mt-3 rounded-md bg-surface p-3 text-sm">{r.stem}</p>}
        <div className="mt-3"><HelpStatusButtons requestId={r.id} /></div>
      </Card>
      <ol className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={`rounded-xl border p-4 ${m.author_kind === "staff" ? "border-accent-line bg-accent-soft" : "border-line bg-white"}`}>
            <div className="text-xs text-muted">{m.author_kind === "staff" ? `צוות · ${m.author_name ?? ""}` : "תלמיד"} · {new Date(m.created_at).toLocaleString("he-IL")}</div>
            <p className="mt-1 whitespace-pre-wrap text-[15px]">{m.body}</p>
          </li>
        ))}
      </ol>
      <HelpReply requestId={r.id} staff />
    </div>
  );
}
