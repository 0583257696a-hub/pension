import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AssignmentService } from "@/academy/services/assignments";
import { Badge, PageTitle } from "@/components/academy/ui";

/** Grade history (spec §29): every submission, official and practice. */
export default async function GradesPage() {
  const user = await requireUser("/academy/grades");
  const rows = await new AssignmentService(await getDb()).gradeHistory(user);
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="ציונים" subtitle="הציון הרשמי בכל מטלה הוא של ההגשה הראשונה. הגשות נוספות מסומנות כתרגול." />
      {rows.length === 0 ? (
        <p className="text-[15px] text-muted">עדיין אין הגשות.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-[15px]">
            <thead className="bg-surface text-sm text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium">מטלה</th>
                <th className="px-4 py-3 text-start font-medium">סוג</th>
                <th className="px-4 py-3 text-start font-medium">נכונות</th>
                <th className="px-4 py-3 text-start font-medium">ציון</th>
                <th className="px-4 py-3 text-start font-medium">תאריך</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attempt_id} className="border-t border-line">
                  <td className="px-4 py-3 text-ink">{r.title}</td>
                  <td className="px-4 py-3">{r.kind === "official" ? <Badge tone="green">רשמי</Badge> : <Badge>תרגול {r.attempt_no - 1}</Badge>}</td>
                  <td className="ltr px-4 py-3 text-start">{r.correct_count}/{r.total_count}</td>
                  <td className="ltr px-4 py-3 text-start font-bold">{r.score}</td>
                  <td className="px-4 py-3 text-muted">{new Date(r.submitted_at).toLocaleDateString("he-IL")}</td>
                  <td className="px-4 py-3"><Link className="text-sm font-semibold text-accent" href={`/academy/attempts/${r.attempt_id}/results`}>פירוט</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
