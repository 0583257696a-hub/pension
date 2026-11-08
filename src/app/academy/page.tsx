import Link from "next/link";
import { getCurrentUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { btn, Card } from "@/components/academy/ui";

export default async function AcademyHome() {
  const user = await getCurrentUser();
  const syllabus = await new LearningService(await getDb()).getSyllabus(user);
  const course = syllabus?.course;
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-l from-brand-900 to-brand-700 px-6 py-10 text-white sm:px-10">
        <p className="text-sm font-semibold text-brand-100">AI Pension Academy · הכנה למבחני הרישוי</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">{course?.title ?? "מימון וסטטיסטיקה"}</h1>
        <p className="mt-3 max-w-2xl text-brand-100">{course?.subtitle}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {user ? (
            <Link href="/academy/dashboard" className="rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-brand-700">להמשך הלימוד</Link>
          ) : (
            <>
              <Link href="/academy/register" className="rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-brand-700">הרשמה חינם ושיעור ראשון פתוח</Link>
              <Link href="/academy/login" className="rounded-xl border border-white/40 px-5 py-3 text-sm font-bold text-white">כניסה</Link>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["קודם במחשבון", "כל שאלת חישוב נפתחת בפתרון במחשבון הפיננסי CASIO FC-200V: מצב, נתונים, רצף מקשים ותוצאה צפויה."],
          ["פתרון מאומת", "כל פתרון נבדק מול מנוע מתמטי נפרד ועובר אישור מקצועי לפני שהוא מוצג."],
          ["מורה AI אישי", "שאלו על כל שיעור או שאלה. המורה מסביר בעברית, והדרך במחשבון מוצגת ראשונה."],
        ].map(([title, text]) => (
          <Card key={title}>
            <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{text}</p>
          </Card>
        ))}
      </div>

      {syllabus && (
        <Card>
          <h2 className="text-xl font-extrabold">מה לומדים בקורס</h2>
          <ol className="mt-4 space-y-3">
            {syllabus.units.map((u) => (
              <li key={u.id} className="rounded-xl border border-slate-200 p-4">
                <div className="font-bold text-slate-900">{u.title}</div>
                <p className="mt-1 text-sm text-slate-600">{u.description_md}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <Link className={btn.secondary} href="/academy/course">לתוכנית הלימודים המלאה</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
