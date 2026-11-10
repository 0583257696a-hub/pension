import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { HELP_STATUS_LABEL, HelpService, type HelpStatus } from "@/academy/services/help";
import ActionButton from "@/components/academy/admin/ActionButton";
import { Badge, Card } from "@/components/academy/ui";

const FILTERS: Array<[string, string]> = [["open", "פתוחות"], ["new", "חדשות"], ["in_progress", "בטיפול"], ["answered", "נענו"], ["closed", "נסגרו"]];

/** "פניות תלמידים": question-specific help requests (spec §14). */
export default async function SupportInbox({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await searchParams;
  await requireStaff();
  const db = await getDb();
  const help = new HelpService(db);
  const rows = await help.inbox({ status: status as HelpStatus | "open" });
  const counts = await help.counts();
  const contacts = await db.all<{ id: string; name: string; email: string; subject: string; message: string; created_at: string }>(
    "SELECT * FROM contact_messages WHERE status = 'new' ORDER BY created_at DESC LIMIT 50",
  );
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-extrabold">פניות תלמידים</h1>
        <p className="mt-1 text-sm text-muted">כל פנייה מגיעה עם פרטי התלמיד, השיעור, המטלה, השאלה וגרסתה והתשובה שנבחרה. התשובות נכתבות על ידי הצוות.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {FILTERS.map(([key, label]) => (
            <Link key={key} href={`/academy/admin/support?status=${key}`} className={`rounded-md px-3 py-1.5 ${status === key ? "bg-dark text-white" : "border border-line"}`}>
              {label}{key in counts ? ` (${counts[key as HelpStatus]})` : ""}
            </Link>
          ))}
        </div>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-3 text-start font-medium">תלמיד</th>
              <th className="px-3 py-3 text-start font-medium">מטלה ושאלה</th>
              <th className="px-3 py-3 text-start font-medium">הודעה</th>
              <th className="px-3 py-3 text-start font-medium">סטטוס</th>
              <th className="px-3 py-3 text-start font-medium">מטפל</th>
              <th className="px-3 py-3 text-start font-medium">נפתחה</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">אין פניות בסינון זה.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-3 py-3">{r.full_name || r.email}</td>
                <td className="px-3 py-3">{r.assignment_title} · שאלה {r.question_position} <span className="text-muted">(גרסה {r.question_version})</span></td>
                <td className="px-3 py-3"><Link className="line-clamp-2 text-accent" href={`/academy/admin/support/${r.id}`}>{r.message}</Link></td>
                <td className="px-3 py-3"><Badge tone={r.status === "new" ? "red" : r.status === "in_progress" ? "amber" : "green"}>{HELP_STATUS_LABEL[r.status]}</Badge></td>
                <td className="px-3 py-3">{r.assignee ?? "—"}</td>
                <td className="px-3 py-3 text-muted">{new Date(r.created_at).toLocaleString("he-IL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contacts.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-bold">הודעות מטופס צור קשר ({contacts.length})</h2>
          <ul className="divide-y divide-line text-sm">
            {contacts.map((c) => (
              <li key={c.id} className="py-3">
                <div className="font-semibold">{c.name} · <span className="ltr">{c.email}</span>{c.subject ? ` · ${c.subject}` : ""}</div>
                <p className="mt-1 whitespace-pre-wrap text-body">{c.message}</p>
                <div className="mt-2"><MarkHandled id={c.id} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MarkHandled({ id }: { id: string }) {
  return <ActionButton action="contact.handled" payload={{ messageId: id }} label="סימון כטופל" variant="ghost" />;
}
