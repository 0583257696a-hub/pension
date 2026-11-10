import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { isLlmConfigured } from "@/academy/ai/client";
import { getNotebookProvider } from "@/academy/notebook/provider";
import { getConfig } from "@/academy/config";
import { ContentAdminService } from "@/academy/services/content-admin";
import { listFacts } from "@/academy/services/facts";
import { LearningService } from "@/academy/services/learning";
import { Badge } from "@/components/academy/ui";

const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const JOB_KIND: Record<string, string> = { syllabus_split: "חלוקת סילבוס", lesson_plan: "מערך שיעור", questions: "יצירת שאלות", solutions: "פתרונות", notebook_sources: "מקורות NotebookLM" };

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? "היום" : d === 1 ? "יום" : `${d} ימים`;
}

function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-white ${className}`}>
      <div className="flex items-center justify-between gap-3 px-6 pb-4 pt-6">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Admin overview (design 05). Every number is read from the database. */
export default async function AdminOverview() {
  await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const queue = await new ContentAdminService(db).reviewQueue();
  const facts = course ? await listFacts(db, course.calculator_model) : [];
  const pendingFacts = facts.filter((f) => f.status !== "confirmed").length;

  const n = async (sql: string, params: string[] = []) => Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);
  const nowIso = new Date().toISOString();
  const activeAccess = await n("SELECT COUNT(DISTINCT user_id) AS n FROM entitlements WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)", [nowIso]);
  const activeSubscriptions = await n("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND current_period_end > ?", [nowIso]);
  const sales30 = await n("SELECT COALESCE(SUM(amount_agorot),0) AS n FROM orders WHERE status = 'paid' AND paid_at >= ?", [isoDaysAgo(30)]);
  const submissions30 = await n("SELECT COUNT(*) AS n FROM assignment_attempts WHERE kind = 'official' AND status = 'submitted' AND submitted_at >= ?", [isoDaysAgo(30)]);
  const openHelp = await n("SELECT COUNT(*) AS n FROM help_requests WHERE status IN ('new','in_progress')");
  const students = await n("SELECT COUNT(*) AS n FROM users WHERE role = 'student'");
  const newStudents = await n("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND created_at >= ?", [isoDaysAgo(30)]);
  const publishedLessons = await n("SELECT COUNT(*) AS n FROM lessons WHERE status = 'published'");
  const approvedQuestions = await n("SELECT COUNT(*) AS n FROM questions WHERE status = 'approved'");
  const oldestReview = await db.get<{ at: string | null }>("SELECT MIN(updated_at) AS at FROM questions WHERE status = 'review'");

  // Registrations per month, last 6 months
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 5, 1);
  since.setUTCHours(0, 0, 0, 0);
  const regRows = await db.all<{ month: string; n: number }>(
    "SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM users WHERE role = 'student' AND created_at >= ? GROUP BY month",
    [since.toISOString()],
  );
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(since);
    d.setUTCMonth(since.getUTCMonth() + i);
    const key = d.toISOString().slice(0, 7);
    return { key, label: HEB_MONTHS[d.getUTCMonth()], n: Number(regRows.find((r) => r.month === key)?.n ?? 0) };
  });
  const maxReg = Math.max(1, ...months.map((m) => m.n));

  const jobs = await db.all<{ id: string; kind: string; status: string; created_at: string }>("SELECT id, kind, status, created_at FROM content_jobs ORDER BY created_at DESC LIMIT 4");
  const video = await db.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM video_assets GROUP BY status");
  const vcount = (s: string) => Number(video.find((v) => v.status === s)?.n ?? 0);
  const targets = publishedLessons + approvedQuestions;
  const withPackage = await n("SELECT COUNT(DISTINCT target_type || ':' || target_id) AS n FROM production_packages");
  const withVideo = await n("SELECT COUNT(DISTINCT target_type || ':' || target_id) AS n FROM video_assets WHERE status = 'published'");
  const videosInReview = await db.all<{ id: string; target_type: string; target_id: string; created_at: string }>("SELECT id, target_type, target_id, created_at FROM video_assets WHERE status = 'review' ORDER BY created_at LIMIT 3");
  const subs = await db.all<{ full_name: string; email: string; source: string; status: string; expires_at: string | null; created_at: string }>(
    "SELECT u.full_name, u.email, e.source, e.status, e.expires_at, e.created_at FROM entitlements e JOIN users u ON u.id = e.user_id ORDER BY e.created_at DESC LIMIT 5",
  );
  const config = getConfig();
  const notebook = getNotebookProvider();

  const tiles: Array<{ label: string; value: number; note: string; tone: "green" | "amber" | "muted"; href: string }> = [
    { label: "תלמידים עם גישה פעילה", value: activeAccess, note: `${activeSubscriptions} מנויים מתחדשים · מכירות 30 יום: ${(sales30 / 100).toLocaleString("he-IL")} ₪`, tone: "muted", href: "/academy/admin/billing" },
    { label: "מטלות שהוגשו (30 יום)", value: submissions30, note: "הגשות רשמיות", tone: "muted", href: "/academy/admin/assignments" },
    { label: "פניות פתוחות", value: openHelp, note: openHelp ? "ממתינות לתשובה" : "אין פניות פתוחות", tone: openHelp ? "amber" : "green", href: "/academy/admin/support" },
    { label: "תלמידים רשומים", value: students, note: `+${newStudents} ב-30 הימים האחרונים`, tone: newStudents ? "green" : "muted", href: "/academy/admin/users" },
    { label: "שיעורים שפורסמו", value: publishedLessons, note: `${approvedQuestions} שאלות מאושרות`, tone: "muted", href: "/academy/admin/content" },
    { label: "ממתינים לבקרה אקדמית", value: queue.length + videosInReview.length, note: oldestReview?.at ? `הוותיק ביותר: ${daysAgo(oldestReview.at)}` : "אין פריטים בתור", tone: queue.length ? "amber" : "muted", href: "/academy/admin/content" },
    { label: "עובדות מחשבון לא מאומתות", value: pendingFacts, note: pendingFacts ? "פתרונות המחשבון מוסתרים עד האימות" : "כל העובדות אומתו", tone: pendingFacts ? "amber" : "green", href: "/academy/admin/calculator" },
  ];
  const toneClass = { green: "text-success-ink", amber: "text-warn-ink", muted: "text-muted" };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <h1 className="text-[28px] font-extrabold tracking-tight">סקירה כללית</h1>

      <div className="grid overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t, i) => (
          <Link key={t.label} href={t.href} className={`flex flex-col gap-2 p-5 hover:bg-surface ${i > 0 ? "border-t border-line sm:border-t-0 lg:border-r" : ""}`}>
            <span className="text-sm text-muted">{t.label}</span>
            <span className="ltr text-start text-3xl font-bold">{t.value.toLocaleString("he-IL")}</span>
            <span className={`text-xs ${toneClass[t.tone]}`}>{t.note}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="הרשמות תלמידים" action={<span className="text-xs text-muted">6 חודשים אחרונים</span>}>
          <div className="px-6 pb-6">
            <div className="flex h-56 items-end gap-4 border-b border-line">
              {months.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center justify-end gap-2">
                  <span className="ltr text-xs font-semibold text-subtle">{m.n}</span>
                  <div className="w-full max-w-16 rounded-t-sm bg-dark" style={{ height: `${Math.max(2, (m.n / maxReg) * 180)}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4">
              {months.map((m) => <span key={m.key} className="flex-1 text-center text-xs text-muted">{m.label}</span>)}
            </div>
          </div>
        </Panel>

        <Panel title="משימות AI" action={<Link href="/academy/admin/ai" className="text-sm font-semibold text-accent">לסטודיו</Link>}>
          <div className="flex flex-col gap-4 px-6 pb-6">
            {jobs.length ? (
              jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-3 border-b border-line-soft pb-3 text-[15px] last:border-0">
                  <span>{JOB_KIND[j.kind] ?? j.kind}</span>
                  <Badge tone={j.status === "done" ? "amber" : j.status === "applied" ? "green" : j.status === "failed" ? "red" : "blue"}>
                    {j.status === "done" ? "ממתין לבדיקה אנושית" : j.status === "applied" ? "הוחל כטיוטה" : j.status === "failed" ? "נכשל" : "בתהליך"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-[15px] text-muted">עדיין לא הורצו משימות.</p>
            )}
            <p className="border-t border-line-soft pt-3 text-[13px] text-muted">תוכן שנוצר ב-AI אינו מתפרסם לפני אישור בבקרה האקדמית.</p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Panel title="סטטוס הפקת סרטונים" action={<Link href="/academy/admin/studio" className="text-sm font-semibold text-accent">לניהול ההפקה</Link>}>
          <div className="px-6 pb-6">
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line sm:grid-cols-3">
              {[
                { label: "ממתין להכנה", value: Math.max(0, targets - withPackage), tone: "text-muted" },
                { label: "חבילות הפקה", value: withPackage, tone: "text-muted" },
                { label: "ממתין לבדיקה", value: vcount("review"), tone: "text-warn-ink" },
                { label: "נדרש תיקון", value: vcount("rejected"), tone: "text-danger-ink" },
                { label: "מאושר, לא פורסם", value: vcount("approved"), tone: "text-muted" },
                { label: "פורסם", value: withVideo, tone: "text-success-ink" },
              ].map((c) => (
                <div key={c.label} className="flex flex-col gap-2 border-b border-l border-line p-4">
                  <span className={`text-[13px] ${c.tone}`}>{c.label}</span>
                  <span className="ltr text-start text-2xl font-bold">{c.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted">הסרטונים מופקים ידנית ב-NotebookLM ({notebook.automatic ? "המחברות נוצרות דרך ה-API" : "מצב ידני"}) ועוברים בדיקה לפני פרסום.</p>
          </div>
        </Panel>

        <Panel title="תור בקרה אקדמית" action={<Link href="/academy/admin/content" className="text-sm font-semibold text-accent">לכל התור</Link>}>
          {queue.length + videosInReview.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="border-y border-line bg-surface text-[13px] text-muted">
                  <tr><th className="px-6 py-2.5 text-start font-medium">פריט</th><th className="px-3 py-2.5 text-start font-medium">מקור</th><th className="px-3 py-2.5 text-start font-medium">בדיקה</th><th className="px-6 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {queue.slice(0, 4).map((q) => (
                    <tr key={q.id}>
                      <td className="max-w-[260px] truncate px-6 py-3">{q.stem_md}</td>
                      <td className="px-3 py-3"><Badge tone={q.source === "ai" ? "blue" : "slate"}>{q.source === "ai" ? "AI" : "צוות"}</Badge></td>
                      <td className="px-3 py-3"><Badge tone={q.verification_status === "failed" ? "red" : "green"}>{q.verification_status === "failed" ? "נכשל" : "תקין"}</Badge></td>
                      <td className="px-6 py-3 text-end"><Link href={`/academy/admin/content/${q.lesson_id}#${q.id}`} className="font-semibold text-accent">לבדיקה</Link></td>
                    </tr>
                  ))}
                  {videosInReview.map((v) => (
                    <tr key={v.id}>
                      <td className="px-6 py-3">סרטון {v.target_type === "lesson" ? "שיעור" : "פתרון"}</td>
                      <td className="px-3 py-3"><Badge>NotebookLM</Badge></td>
                      <td className="px-3 py-3 text-muted">{daysAgo(v.created_at)}</td>
                      <td className="px-6 py-3 text-end"><Link href={`/academy/admin/studio/${v.target_type}/${v.target_id}`} className="font-semibold text-accent">לבדיקה</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-6 pb-6 text-[15px] text-muted">אין פריטים שממתינים לבדיקה.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="גישות אחרונות" action={<Link href="/academy/admin/users" className="text-sm font-semibold text-accent">לכל התלמידים</Link>}>
          {subs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-y border-line bg-surface text-[13px] text-muted">
                  <tr><th className="px-6 py-2.5 text-start font-medium">תלמיד</th><th className="px-3 py-2.5 text-start font-medium">מסלול</th><th className="px-3 py-2.5 text-start font-medium">תאריך</th><th className="px-6 py-2.5 text-start font-medium">סטטוס</th></tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {subs.map((s, i) => (
                    <tr key={i}>
                      <td className="px-6 py-3 font-medium">{s.full_name || s.email}</td>
                      <td className="px-3 py-3 text-muted">{({ purchase: "רכישה", subscription: "מנוי", admin: "הענקה ידנית", coupon: "קופון", legacy: "גישה קודמת" } as Record<string, string>)[s.source] ?? s.source}</td>
                      <td className="ltr px-3 py-3 text-start text-muted">{new Date(s.created_at).toLocaleDateString("he-IL")}</td>
                      <td className="px-6 py-3">
                        <Badge tone={s.status === "active" && (!s.expires_at || s.expires_at > nowIso) ? "green" : "slate"}>
                          {s.status === "revoked" ? "בוטלה" : !s.expires_at || s.expires_at > nowIso ? "פעילה" : "הסתיימה"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-6 pb-6 text-[15px] text-muted">עדיין אין גישות בתשלום.</p>
          )}
        </Panel>

        <Panel title="מצב החיבורים">
          <ul className="flex flex-col gap-3 px-6 pb-6 text-sm">
            <li className="flex items-center justify-between gap-2"><span>בסיס נתונים</span><Badge tone="blue">{db.driver === "d1-binding" ? "Cloudflare D1" : db.driver}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>Claude API</span><Badge tone={isLlmConfigured() ? "green" : "amber"}>{isLlmConfigured() ? config.anthropic.model : "לא הוגדר מפתח"}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>NotebookLM</span><Badge tone={notebook.automatic ? "green" : "amber"}>{notebook.automatic ? "API" : "מצב ידני"}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>סליקה</span><Badge tone={config.payments.provider === "none" ? "amber" : "green"}>{config.payments.provider === "none" ? "לא מחוברת · הפעלה ידנית" : config.payments.provider}</Badge></li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
