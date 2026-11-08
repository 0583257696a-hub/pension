import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { ContentAdminService } from "@/academy/services/content-admin";
import { LearningService } from "@/academy/services/learning";
import ActionButton from "@/components/academy/admin/ActionButton";
import { Badge, Card } from "@/components/academy/ui";

const LESSON_STATUS: Record<string, [string, "green" | "amber" | "slate"]> = {
  published: ["פורסם", "green"],
  review: ["בבדיקה", "amber"],
  draft: ["טיוטה", "slate"],
};

export default async function ContentAdmin() {
  const user = await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  if (!course) return <p>לא הוגדר קורס.</p>;
  const units = await new ContentAdminService(db).overview(course.id);
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold">{course.title}</h2>
          <p className="text-sm text-slate-600">מחשבון הקורס: {course.calculator_model} · מחיר {course.price_ils} ₪ · ניסיון {course.trial_days} ימים</p>
        </div>
        {user.role === "admin" && (
          <ActionButton action="content.import" label="ייבוא מחדש של תוכן הקורס" confirm="הייבוא מעדכן תכנים קיימים ומחזיר לבדיקה פריטים שהשתנו. התקדמות התלמידים נשמרת. להמשיך?" />
        )}
      </Card>
      {units.map((unit) => (
        <Card key={unit.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-extrabold">{unit.title}</h3>
            <Badge tone={unit.status === "published" ? "green" : "slate"}>{unit.status === "published" ? "פורסם" : "טיוטה"}</Badge>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-start text-xs text-slate-500">
                <tr><th className="py-2 text-start">שיעור</th><th className="text-start">סטטוס</th><th className="text-start">גישה</th><th className="text-start">שאלות (מאושרות/סה״כ)</th><th className="text-start">בדיקה</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unit.lessons.map((l) => {
                  const [label, tone] = LESSON_STATUS[l.status] ?? ["?", "slate"];
                  return (
                    <tr key={l.id}>
                      <td className="py-2 font-semibold"><Link className="hover:text-brand-700" href={`/academy/admin/content/${l.id}`}>{l.title}</Link></td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td>{l.access === "free" ? "חינם" : "מנויים"}</td>
                      <td>{l.q_approved}/{l.q_total}</td>
                      <td>{Number(l.q_failed) > 0 ? <Badge tone="red">{l.q_failed} נכשלו</Badge> : l.q_total ? <Badge tone="green">תקין</Badge> : "-"}</td>
                      <td className="text-end"><Link className="text-xs font-bold text-brand-700" href={`/academy/admin/content/${l.id}`}>לבדיקה</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
