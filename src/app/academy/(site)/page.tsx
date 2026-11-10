import Link from "next/link";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import CalculatorFace from "@/components/academy/CalculatorFace";
import { IconCheck, IconFile, IconPlay } from "@/components/academy/icons";

const STEPS = [
  ["01", "מורידים את קובצי השיעור", "מעל כל שיעור: שאלות השיעור ודף נוסחאות ב-PDF, להדפסה או לצפייה."],
  ["02", "צופים בשיעור", "מרצה מסביר בעברית פשוטה, פותר את שאלות הקובץ במחשבון ועוצר כדי שתנסו לבד."],
  ["03", "פותרים מטלה של 20 שאלות", "שאלות אמריקאיות קבועות, עם מעבר קדימה ואחורה ושמירה אוטומטית."],
  ["04", "רואים פתרון וציון", "לכל שאלה פתרון מאושר וסרטון הסבר קצר. בסוף: ציון ורשימת הטעויות."],
];

export default async function AcademyHome() {
  const db = await getDb();
  const service = new LearningService(db);
  const syllabus = await service.getSyllabus(null);
  const course = syllabus?.course;
  const lessons = (syllabus?.lessons ?? []).filter((l) => l.status === "published");

  return (
    <div>
      <section className="mx-auto flex max-w-[1248px] flex-col items-center px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent-hover">
          הכנה לבחינות הרישוי בייעוץ ובשיווק פנסיוני
        </span>
        <h1 className="mt-6 text-[40px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[64px]">
          מימון וסטטיסטיקה,
          <br />
          שיעור אחרי שיעור.
        </h1>
        <p className="mt-6 max-w-[640px] text-lg leading-relaxed text-muted">
          שיעורים מוקלטים וממוקדים, קובצי שאלות ונוסחאות לכל שיעור, ומטלה של 20 שאלות עם פתרון קבוע וסרטון הסבר לכל שאלה. כל פתרון מוצג קודם במחשבון הפיננסי.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={course ? `/academy/courses/${course.slug}` : "/academy/courses"} className="inline-flex h-12 items-center rounded-md bg-accent px-6 text-base font-semibold text-white hover:bg-accent-hover">לפרטי הקורס</Link>
          <Link href="/academy/register" className="inline-flex h-12 items-center rounded-md border border-input px-6 text-base font-semibold text-ink hover:bg-surface">הרשמה ושיעור ראשון</Link>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[1248px] scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="mb-10">
          <div className="text-[13px] font-semibold text-accent">איך לומדים</div>
          <h2 className="mt-2 max-w-xl text-3xl font-bold leading-tight sm:text-[40px]">מסלול קבוע וברור, כמו במכללה</h2>
        </div>
        <div className="grid gap-8 border-t border-ink pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, title, text]) => (
            <div key={n} className="flex flex-col gap-3">
              <span className="text-4xl font-light text-faint">{n}</span>
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto grid max-w-[1248px] gap-5 px-4 py-16 sm:px-6 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex aspect-[16/10] flex-col justify-center gap-3 bg-white p-6">
              {["שאלות השיעור — PDF", "דף נוסחאות — PDF"].map((t) => (
                <div key={t} className="flex items-center gap-3 rounded-md border border-line p-3 text-sm font-semibold"><IconFile size={18} className="text-accent" /> {t}</div>
              ))}
              <div className="flex aspect-video items-center justify-center rounded-md bg-dark text-white"><IconPlay size={18} /></div>
            </div>
            <div className="border-t border-line p-5">
              <h3 className="text-lg font-bold">קבצים מעל הסרטון</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">המרצה פותר בדיוק את השאלות שבקובץ, באותו מספור.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex aspect-[16/10] flex-col justify-center gap-2 p-6 text-sm">
              <div className="text-muted">שאלה 7 מתוך 20</div>
              <div className="font-semibold">הופקדו 6,000 ₪ לשלוש שנים בריבית שנתית של 5%. מה הסכום בסוף?</div>
              {["6,900.00 ₪", "6,945.75 ₪", "7,000.00 ₪"].map((o, i) => (
                <div key={o} className={`rounded-md border px-3 py-1.5 ${i === 1 ? "border-ink bg-line-soft" : "border-line"}`}><span className="ltr">{o}</span></div>
              ))}
            </div>
            <div className="border-t border-line p-5">
              <h3 className="text-lg font-bold">מטלה של 20 שאלות</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">אותן שאלות לכל התלמידים, ציון אחרי ההגשה, ואפשרות לפנות לצוות בכל שאלה.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex aspect-[16/10] items-center justify-center overflow-hidden">
              <div className="origin-center scale-[0.44]">
                <CalculatorFace hot={["SOLVE"]} top="CMPD" main="FV=6945.75" />
              </div>
            </div>
            <div className="border-t border-line p-5">
              <h3 className="text-lg font-bold">פתרון במחשבון קודם</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">איזה מצב בוחרים, מה מזינים ובאיזה סימן. הנוסחה מוצגת כהסבר משני.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="course" className="mx-auto grid max-w-[1248px] scroll-mt-16 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="text-[13px] font-semibold text-accent">הקורס הזמין</div>
          <h2 className="text-3xl font-bold sm:text-[40px]">{course?.title ?? "מימון וסטטיסטיקה"}</h2>
          <p className="text-[17px] leading-relaxed text-muted">14 פרקים בשלושה חלקים: מימון, סטטיסטיקה (כולל קומבינטוריקה והסתברות) והשקעות. כל שיעור עובר בדיקה מקצועית לפני שהוא נפתח.</p>
          <ul className="mt-2 flex flex-col gap-2 text-[15px]">
            {["שיעורים מוקלטים, ממוספרים לפי הסילבוס", "שאלות השיעור ודף נוסחאות ב-PDF", "מטלה של 20 שאלות לכל שיעור", "פתרון וסרטון הסבר קצר לכל שאלה", "פנייה לצוות בכל שאלה: ״צריכים עזרה?״"].map((t) => (
              <li key={t} className="flex items-center gap-2"><IconCheck size={16} className="text-success" /> {t}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-3">
            <Link href="/academy/pricing" className="inline-flex h-11 items-center rounded-md bg-dark px-5 text-[15px] font-semibold text-white hover:bg-black">למחירים</Link>
            {course && <Link href={`/academy/courses/${course.slug}`} className="inline-flex h-11 items-center rounded-md border border-input px-5 text-[15px] font-semibold">תוכן הקורס</Link>}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-white p-6">
          <div className="text-lg font-bold">שיעורים פתוחים</div>
          {lessons.length ? (
            <ol className="mt-4 divide-y divide-line-soft border-t border-line-soft">
              {lessons.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3 text-[15px]">
                  <span>{l.title}</span>
                  {l.access === "free" && <span className="shrink-0 rounded-md bg-success-soft px-2 py-1 text-xs font-semibold text-success-ink">לצפייה חופשית</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-[15px] text-muted">השיעור הראשון בבדיקה מקצועית אחרונה ויפתח בקרוב.</p>
          )}
        </div>
      </section>
    </div>
  );
}
