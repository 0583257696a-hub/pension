import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { HELP_STATUS_LABEL, HelpService } from "@/academy/services/help";
import { Badge, PageTitle } from "@/components/academy/ui";

/** "הפניות שלי": question-specific help requests and the team's answers. */
export default async function MyHelpPage() {
  const user = await requireUser("/academy/help");
  const rows = await new HelpService(await getDb()).listForStudent(user);
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="הפניות שלי" subtitle="פניות ששלחת דרך ״צריכים עזרה?״ בשאלות המטלה. הצוות עונה כאן." />
      {rows.length === 0 ? (
        <p className="text-[15px] text-muted">עדיין לא נשלחו פניות. בכל שאלה במטלה יש כפתור ״צריכים עזרה?״.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-white">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-line last:border-b-0">
              <Link href={`/academy/help/${r.id}`} className="flex items-start gap-3 p-4 hover:bg-surface">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted">{r.assignment_title ?? "מטלה"} · שאלה {r.question_position ?? ""}</div>
                  <p className="mt-1 line-clamp-2 text-[15px] text-ink">{r.message}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={r.status === "answered" ? "green" : r.status === "closed" ? "slate" : "blue"}>{HELP_STATUS_LABEL[r.status]}</Badge>
                  {Number(r.unread) > 0 && <span className="text-xs font-semibold text-accent">תשובה חדשה</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
