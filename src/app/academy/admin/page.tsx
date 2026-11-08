import Link from "next/link";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { isLlmConfigured } from "@/academy/ai/client";
import { getNotebookProvider } from "@/academy/notebook/provider";
import { getConfig } from "@/academy/config";
import { ContentAdminService } from "@/academy/services/content-admin";
import { listFacts } from "@/academy/services/facts";
import { LearningService } from "@/academy/services/learning";
import { Badge, Card } from "@/components/academy/ui";

export default async function AdminOverview() {
  await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const queue = await new ContentAdminService(db).reviewQueue();
  const facts = course ? await listFacts(db, course.calculator_model) : [];
  const pendingFacts = facts.filter((f) => f.status !== "confirmed");
  const videosInReview = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM video_assets WHERE status = 'review'");
  const students = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'student'");
  const subs = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('trial','active')");
  const config = getConfig();
  const notebook = getNotebookProvider();

  const tiles = [
    { label: "שאלות ממתינות לאישור", value: queue.length, href: "/academy/admin/content" },
    { label: "עובדות מחשבון לא מאומתות", value: pendingFacts.length, href: "/academy/admin/calculator" },
    { label: "סרטונים ממתינים לבדיקה", value: Number(videosInReview?.n ?? 0), href: "/academy/admin/studio" },
    { label: "תלמידים", value: Number(students?.n ?? 0), href: "/academy/admin/users" },
    { label: "מנויים פעילים וניסיון", value: Number(subs?.n ?? 0), href: "/academy/admin/users" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
            <div className="text-2xl font-black">{t.value}</div>
            <div className="text-xs text-slate-500">{t.label}</div>
          </Link>
        ))}
      </div>

      <Card>
        <h2 className="text-lg font-extrabold">מצב החיבורים</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center justify-between gap-2"><span>בסיס נתונים</span><Badge tone="blue">{config.db.driver}</Badge></li>
          <li className="flex items-center justify-between gap-2"><span>אחסון קבצים</span><Badge tone="blue">{config.storage.driver}</Badge></li>
          <li className="flex items-center justify-between gap-2"><span>Claude API (מורה ומנוע תוכן)</span><Badge tone={isLlmConfigured() ? "green" : "amber"}>{isLlmConfigured() ? `מחובר · ${config.anthropic.model}` : "לא הוגדר מפתח"}</Badge></li>
          <li className="flex items-center justify-between gap-2"><span>NotebookLM</span><Badge tone={notebook.automatic ? "green" : "amber"}>{notebook.automatic ? "Gemini Notebook Enterprise API" : "מצב ידני"}</Badge></li>
          <li className="flex items-center justify-between gap-2"><span>סליקה</span><Badge tone={config.payments.provider === "none" ? "amber" : "green"}>{config.payments.provider === "none" ? "לא הוגדר ספק. הפעלת מנויים ידנית בלבד" : config.payments.provider}</Badge></li>
        </ul>
      </Card>

      {pendingFacts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="font-extrabold text-amber-900">הפתרונות במחשבון עדיין לא מוצגים לתלמידים</h2>
          <p className="mt-1 text-sm text-amber-900">
            {pendingFacts.length} עובדות על ה-CASIO FC-200V ממתינות לאימות מול המדריך הרשמי או מול המחשבון עצמו. עד לאימותן התלמידים רואים את הפתרון המאומת בנוסחה.
          </p>
          <Link href="/academy/admin/calculator" className="mt-2 inline-block text-sm font-bold text-amber-900 underline">לאימות עובדות המחשבון</Link>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-extrabold">תור אישור תוכן</h2>
        {queue.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">אין שאלות שממתינות לאישור.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {queue.slice(0, 12).map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/academy/admin/content/${q.lesson_id}#${q.id}`} className="min-w-0 truncate hover:text-brand-700">{q.stem_md}</Link>
                <Badge tone={q.verification_status === "failed" ? "red" : "green"}>{q.verification_status === "failed" ? "נכשל בבדיקה" : "נבדק אוטומטית"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
