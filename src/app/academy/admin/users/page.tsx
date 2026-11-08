import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AuthService } from "@/academy/auth/service";
import { EntitlementService } from "@/academy/billing/entitlements";
import { LearningService } from "@/academy/services/learning";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import { Badge, Card } from "@/components/academy/ui";

const SUB: Record<string, [string, "green" | "blue" | "amber" | "slate"]> = {
  trial: ["ניסיון", "blue"], active: ["פעיל", "green"], canceled: ["בוטל", "amber"], expired: ["הסתיים", "slate"],
};

export default async function UsersAdmin() {
  const me = await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const users = await new AuthService(db).listUsers();
  const subs = course ? await new EntitlementService(db).listForCourse(course.id) : [];
  const progress = await db.all<{ user_id: string; done: number; attempts: number }>(
    `SELECT u.id AS user_id,
       (SELECT COUNT(*) FROM lesson_progress p WHERE p.user_id = u.id AND p.completed = 1) AS done,
       (SELECT COUNT(*) FROM question_attempts a WHERE a.user_id = u.id) AS attempts
     FROM users u`,
  );
  const byUser = new Map(progress.map((p) => [p.user_id, p]));
  const isAdmin = me.role === "admin";
  const latestSub = (userId: string) => subs.find((s) => s.user_id === userId);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-extrabold">תלמידים ומנויים</h2>
        <p className="mt-1 text-sm text-muted">
          עד לחיבור ספק סליקה מאומת, הפעלת מנוי נעשית ידנית לאחר תשלום מאומת (למשל חשבונית והעברה בנקאית), עם אסמכתא. אין במערכת תשלום מדומה.
        </p>
      </Card>
      {users.map((u) => {
        const sub = latestSub(u.id);
        const p = byUser.get(u.id);
        const [subLabel, subTone] = sub ? SUB[sub.status] : ["ללא מנוי", "slate" as const];
        return (
          <Card key={u.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="font-bold">{u.full_name || "(ללא שם)"} <span className="ltr text-sm font-normal text-muted">{u.email}</span></div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <Badge tone={u.role === "admin" ? "violet" : u.role === "reviewer" ? "blue" : "slate"}>{u.role === "admin" ? "מנהל" : u.role === "reviewer" ? "בודק תוכן" : "תלמיד"}</Badge>
                  {u.status === "blocked" && <Badge tone="red">חסום</Badge>}
                  <Badge tone={subTone}>{subLabel}{sub && (sub.current_period_end || sub.trial_ends_at) ? ` עד ${new Date((sub.status === "trial" ? sub.trial_ends_at : sub.current_period_end) ?? "").toLocaleDateString("he-IL")}` : ""}</Badge>
                  <span className="text-muted">{p?.done ?? 0} שיעורים הושלמו · {p?.attempts ?? 0} תשובות</span>
                </div>
                {sub?.note && <p className="mt-1 text-xs text-muted">אסמכתא: {sub.note}</p>}
              </div>
              {isAdmin && u.id !== me.id && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton action="user.role" payload={{ userId: u.id, role: u.role === "reviewer" ? "student" : "reviewer" }} label={u.role === "reviewer" ? "הסרת הרשאת בודק" : "הגדרה כבודק תוכן"} variant="ghost" confirm="לשנות את התפקיד?" />
                  <ActionButton action="user.status" payload={{ userId: u.id, status: u.status === "blocked" ? "active" : "blocked" }} label={u.status === "blocked" ? "ביטול חסימה" : "חסימה"} variant="ghost" confirm="לשנות את סטטוס המשתמש?" />
                  {sub && (sub.status === "active" || sub.status === "trial") && (
                    <>
                      <ActionButton action="sub.cancel" payload={{ subscriptionId: sub.id }} label="ביטול חידוש" variant="ghost" confirm="לבטל את החידוש? הגישה תישמר עד סוף התקופה." />
                      <ActionButton action="sub.revoke" payload={{ subscriptionId: sub.id, note: "בוטל מיידית על ידי מנהל" }} label="ביטול גישה מיידי" variant="danger" confirm="לבטל את הגישה מיד?" />
                    </>
                  )}
                </div>
              )}
            </div>
            {isAdmin && u.role === "student" && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-brand-700">הפעלת מנוי ידנית לאחר תשלום</summary>
                <div className="mt-2 max-w-md">
                  <ActionForm action="sub.grant" payload={{ userId: u.id }} submitLabel="הפעלת מנוי"
                    confirm="להפעיל מנוי בתשלום למשתמש זה?"
                    fields={[
                      { name: "until", label: "בתוקף עד", type: "date", required: true },
                      { name: "note", label: "אסמכתת תשלום (מספר חשבונית / העברה)", required: true },
                    ]} />
                </div>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}
