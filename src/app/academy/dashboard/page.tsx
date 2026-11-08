import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { Badge, btn, Card, PageTitle } from "@/components/academy/ui";

function entitlementText(reason: string, endsAt: string | null) {
  const until = endsAt ? new Date(endsAt).toLocaleDateString("he-IL") : "";
  switch (reason) {
    case "staff": return "גישת צוות מלאה";
    case "trial": return `תקופת ניסיון עד ${until}`;
    case "active": return `מנוי פעיל עד ${until}`;
    case "canceled_until_period_end": return `המנוי בוטל. הגישה נשמרת עד ${until}`;
    case "expired": return "המנוי הסתיים";
    default: return "חשבון חינמי: השיעור הראשון פתוח";
  }
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ forbidden?: string }> }) {
  const user = await requireUser("/academy/dashboard");
  const { forbidden } = await searchParams;
  const data = await new LearningService(await getDb()).getDashboard(user);
  if (!data) return <p>הקורס עדיין לא הוגדר.</p>;
  const pct = data.stats.publishedLessons ? Math.round((data.stats.completedLessons / data.stats.publishedLessons) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageTitle title={`שלום, ${user.full_name || "לומד/ת"}`} subtitle={data.course.title} />
      {forbidden && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">אין לך הרשאה לאזור הניהול.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-slate-500">התקדמות בקורס</div>
          <div className="mt-1 text-3xl font-black">{pct}%</div>
          <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
          <div className="mt-2 text-xs text-slate-500">{data.stats.completedLessons} מתוך {data.stats.publishedLessons} שיעורים הושלמו</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">שאלות שפתרת</div>
          <div className="mt-1 text-3xl font-black">{data.stats.attempts}</div>
          <div className="mt-2 text-xs text-slate-500">{data.stats.accuracy === null ? "עוד לא נפתרו שאלות" : `${data.stats.accuracy}% תשובות נכונות`}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">המנוי שלי</div>
          <div className="mt-1 font-bold">{entitlementText(data.entitlement.reason, data.entitlement.endsAt)}</div>
          <Link href="/academy/account" className={`${btn.ghost} mt-2 px-0`}>ניהול המנוי</Link>
        </Card>
      </div>

      {data.next && (
        <Card className="border-brand-200 bg-brand-50">
          <div className="text-sm font-semibold text-brand-700">השיעור הבא שלך</div>
          <div className="mt-1 text-xl font-extrabold">{data.next.title}</div>
          <div className="text-sm text-slate-600">{data.next.unitTitle}</div>
          <Link href={`/academy/lesson/${data.next.slug}`} className={`${btn.primary} mt-4`}>להמשך הלימוד</Link>
        </Card>
      )}

      {data.exams.length > 0 && (
        <Card>
          <h2 className="text-lg font-extrabold">מבחני פרק וסימולציות</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.exams.map((e) => (
              <Link key={e.id} href={`/academy/quiz/${e.id}`} className="rounded-xl border border-slate-200 p-3 hover:border-brand-300">
                <div className="font-bold">{e.title}</div>
                <div className="text-xs text-slate-500">{e.count} שאלות{e.timeLimit ? ` · ${e.timeLimit} דקות` : ""}</div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">תוכנית הלימודים</h2>
          <Link className={btn.ghost} href="/academy/course">לתצוגה מלאה</Link>
        </div>
        <ul className="mt-3 space-y-2">
          {data.units.slice(0, 3).map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <span className="font-semibold">{u.title}</span>
              <Badge tone={u.status === "published" ? "green" : "slate"}>{u.status === "published" ? "פתוח" : "בקרוב"}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
