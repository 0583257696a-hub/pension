import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { Badge, Card } from "@/components/academy/ui";

/** PDF document manager: lesson materials per lesson. */
export default async function AdminMaterials() {
  await requireStaff();
  const db = await getDb();
  const rows = await db.all<{ id: string; number: number; title: string; status: string; published: number; drafts: number }>(
    `SELECT l.id, l.number, l.title, l.status,
       (SELECT COUNT(*) FROM lesson_assets a WHERE a.lesson_id = l.id AND a.status = 'published') AS published,
       (SELECT COUNT(*) FROM lesson_assets a WHERE a.lesson_id = l.id AND a.status = 'draft') AS drafts
     FROM lessons l WHERE l.number IS NOT NULL ORDER BY l.number`,
  );
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-extrabold">קובצי PDF</h1>
        <p className="mt-1 text-sm text-muted">שאלות השיעור, דף נוסחאות, סיכום וחוברת מטלה. הקבצים מופקים מהתוכן המאושר (עברית מימין לשמאל, נוסחאות משמאל לימין, גופן מוטמע), נשמרים כגרסה ומוצגים לתלמידים רק אחרי פרסום.</p>
      </Card>
      <ul className="overflow-hidden rounded-xl border border-line bg-white">
        {rows.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 border-b border-line p-4 last:border-b-0">
            <Link className="font-semibold text-accent" href={`/academy/admin/materials/${l.id}`}>{l.title}</Link>
            <span className="flex gap-2 text-xs">
              <Badge tone={Number(l.published) ? "green" : "slate"}>{Number(l.published)} מפורסמים</Badge>
              {Number(l.drafts) > 0 && <Badge tone="amber">{Number(l.drafts)} טיוטות</Badge>}
              {l.status !== "published" && <Badge>שיעור בטיוטה</Badge>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
