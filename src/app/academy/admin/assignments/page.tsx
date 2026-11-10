import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AssignmentService } from "@/academy/services/assignments";
import { LearningService } from "@/academy/services/learning";
import { Badge, Card } from "@/components/academy/ui";

/** Assignment manager: one fixed assignment per lesson. */
export default async function AdminAssignments() {
  await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const rows = course ? await new AssignmentService(db).adminList(course.id) : [];
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-extrabold">מטלות</h1>
        <p className="mt-1 text-sm text-muted">מטלה לכל שיעור, ברירת מחדל 20 שאלות. פרסום מקבע את גרסאות השאלות המאושרות: כל התלמידים מקבלים אותה גרסה, וציונים קודמים לא משתנים.</p>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-3 text-start font-medium">מטלה</th>
              <th className="px-3 py-3 text-start font-medium">שיעור</th>
              <th className="px-3 py-3 text-start font-medium">שאלות</th>
              <th className="px-3 py-3 text-start font-medium">סטטוס</th>
              <th className="px-3 py-3 text-start font-medium">הגשות</th>
              <th className="px-3 py-3 text-start font-medium">ממוצע</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="px-3 py-3"><Link className="font-semibold text-accent" href={`/academy/admin/assignments/${a.id}`}>{a.title}</Link></td>
                <td className="px-3 py-3">{a.lesson_title}</td>
                <td className="px-3 py-3"><span className="ltr">{Number(a.approved)}/{Number(a.items)}</span> מאושרות · נדרש {a.question_count}</td>
                <td className="px-3 py-3">{a.status === "published" ? <Badge tone="green">פורסמה · גרסה {a.version}</Badge> : <Badge>טיוטה</Badge>}</td>
                <td className="px-3 py-3">{Number(a.attempts)}</td>
                <td className="px-3 py-3">{a.avg_score !== null ? Math.round(Number(a.avg_score)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
