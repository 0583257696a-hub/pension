import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AuthService } from "@/academy/auth/service";
import { EntitlementService } from "@/academy/billing/entitlements";
import { LearningService } from "@/academy/services/learning";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import { Badge, Card } from "@/components/academy/ui";

const SOURCE: Record<string, string> = { purchase: "רכישה", subscription: "מנוי", admin: "הענקה ידנית", coupon: "קופון", legacy: "גישה קודמת" };

export default async function UsersAdmin() {
  const me = await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const users = await new AuthService(db).listUsers();
  const grants = course ? await new EntitlementService(db).listForCourse(course.id) : [];
  const progress = await db.all<{ user_id: string; done: number; attempts: number; avg: number | null }>(
    `SELECT u.id AS user_id,
       (SELECT COUNT(*) FROM lesson_progress p WHERE p.user_id = u.id AND p.completed = 1) AS done,
       (SELECT COUNT(*) FROM assignment_attempts a WHERE a.user_id = u.id AND a.kind = 'official' AND a.status = 'submitted') AS attempts,
       (SELECT AVG(a.score) FROM assignment_attempts a WHERE a.user_id = u.id AND a.kind = 'official' AND a.status = 'submitted') AS avg
     FROM users u`,
  );
  const nowIso = new Date().toISOString();
  const activeGrant = (userId: string) =>
    grants.find((g) => g.user_id === userId && g.status === "active" && (!g.expires_at || g.expires_at > nowIso));
  const byUser = new Map(progress.map((p) => [p.user_id, p]));
  const isAdmin = me.role === "admin";

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-extrabold">תלמידים וגישה</h2>
        <p className="mt-1 text-sm text-muted">
          הענקת גישה ידנית מיועדת לתשלום שאומת מחוץ לאתר (חשבונית, העברה בנקאית) או להחלטה עסקית מתועדת, תמיד עם אסמכתא. אין במערכת תשלום מדומה.
        </p>
      </Card>
      {users.map((u) => {
        const grant = activeGrant(u.id);
        const p = byUser.get(u.id);
        return (
          <Card key={u.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="font-bold">{u.full_name || "(ללא שם)"} <span className="ltr text-sm font-normal text-muted">{u.email}</span></div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <Badge tone={u.role === "admin" ? "violet" : u.role === "reviewer" ? "blue" : "slate"}>{u.role === "admin" ? "מנהל" : u.role === "reviewer" ? "בודק תוכן" : "תלמיד"}</Badge>
                  {u.status === "blocked" && <Badge tone="red">חסום</Badge>}
                  <Badge tone={grant ? "green" : "slate"}>{grant ? `גישה: ${SOURCE[grant.source] ?? grant.source}${grant.expires_at ? ` עד ${new Date(grant.expires_at).toLocaleDateString("he-IL")}` : ""}` : "ללא גישה בתשלום"}</Badge>
                  <span className="text-muted">{p?.done ?? 0} שיעורים הושלמו · {Number(p?.attempts ?? 0)} מטלות הוגשו{p?.avg !== null && p?.avg !== undefined ? ` · ממוצע ${Math.round(Number(p.avg))}` : ""}</span>
                </div>
                {grant?.note && <p className="mt-1 text-xs text-muted">אסמכתא: {grant.note}</p>}
              </div>
              {isAdmin && u.id !== me.id && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton action="user.role" payload={{ userId: u.id, role: u.role === "reviewer" ? "student" : "reviewer" }} label={u.role === "reviewer" ? "הסרת הרשאת בודק" : "הגדרה כבודק תוכן"} variant="ghost" confirm="לשנות את התפקיד?" />
                  <ActionButton action="user.status" payload={{ userId: u.id, status: u.status === "blocked" ? "active" : "blocked" }} label={u.status === "blocked" ? "ביטול חסימה" : "חסימה"} variant="ghost" confirm="לשנות את סטטוס המשתמש?" />
                  {grant && <ActionButton action="ent.revoke" payload={{ entitlementId: grant.id, note: "בוטל על ידי מנהל" }} label="ביטול גישה מיידי" variant="danger" confirm="לבטל את הגישה מיד?" />}
                </div>
              )}
            </div>
            {isAdmin && u.role === "student" && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-brand-700">הענקת גישה ידנית</summary>
                <div className="mt-2 max-w-md">
                  <ActionForm action="sub.grant" payload={{ userId: u.id }} submitLabel="הענקת גישה"
                    confirm="להעניק גישה לקורס למשתמש זה?"
                    fields={[
                      { name: "until", label: "בתוקף עד (ריק = ללא הגבלה)", type: "date" },
                      { name: "note", label: "אסמכתא (מספר חשבונית / העברה / סיבה)", required: true },
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
