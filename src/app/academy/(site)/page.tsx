import Link from "next/link";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import CalculatorFace from "@/components/academy/CalculatorFace";
import { IconCheck, IconPlay, IconSparkle } from "@/components/academy/icons";

const STEPS = [
  ["01", "צופים בשיעור", "שיעורים ממוקדים, עם סיכום ודף נוסחאות לכל נושא."],
  ["02", "מתרגלים", "שאלות בסגנון הבחינה, מסודרות לפי נושא ורמת קושי."],
  ["03", "מבינים את הפתרון", "פתרון מלא במחשבון הפיננסי, בנוסחה ובסרטון, ומורה AI לשאלות המשך."],
  ["04", "נבחנים בסימולציה", "מבחני פרק וסימולציות מלאות עם שעון וציון."],
];

const FAQ = [
  ["איזה מחשבון פיננסי צריך?", "ההדרכות בנויות כרגע על דגם CASIO FC-200V. לפני הרכישה כדאי לוודא מול הנחיות הבחינה העדכניות אילו דגמים מותרים."],
  ["האם המורה AI נותן את התשובה מיד?", "המורה מכיר את השיעור ואת השאלה שאתם פותרים. לפני שעניתם הוא נותן רמזים ומסביר את הדרך. אחרי שעניתם הוא מסביר את הפתרון המאומת, קודם במחשבון ואחר כך בנוסחה."],
  ["אפשר לבטל את המנוי?", "כן, בכל עת מעמוד החשבון. הגישה נשמרת עד סוף התקופה ששולמה."],
  ["האם התוכן נבדק על ידי אנשי מקצוע?", "כל שאלה נבדקת אוטומטית מול מנוע חישוב נפרד, ומתפרסמת רק אחרי אישור מקצועי. תוכן שנוצר בעזרת AI אינו מוצג לפני האישור."],
];

const MASTERY_DEMO: Array<[string, number]> = [
  ["ערך עתידי ונוכחי", 86],
  ["קצבאות ולוחות סילוקין", 72],
  ["ריבית אפקטיבית", 54],
  ["הסתברות וקומבינטוריקה", 61],
];

export default async function AcademyHome() {
  const db = await getDb();
  const service = new LearningService(db);
  const syllabus = await service.getSyllabus(null);
  const course = syllabus?.course;
  const counts = await db.get<{ lessons: number; questions: number }>(
    `SELECT (SELECT COUNT(*) FROM lessons WHERE status = 'published') AS lessons,
            (SELECT COUNT(*) FROM questions q JOIN lessons l ON l.id = q.lesson_id WHERE q.status = 'approved' AND l.status = 'published') AS questions`,
  );

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto flex max-w-[1248px] flex-col items-center px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
        <Link href="/academy#course" className="inline-flex items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent-hover">
          הכנה לבחינות הרישוי בייעוץ פנסיוני
        </Link>
        <h1 className="mt-6 text-[40px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[64px]">
          מתכוננים לבחינה.
          <br />
          לומדים חכם יותר.
        </h1>
        <p className="mt-6 max-w-[640px] text-lg leading-relaxed text-muted">
          פלטפורמת לימודים עם שיעורים ממוקדים, תרגול בסגנון הבחינה, פתרונות צעד אחר צעד במחשבון הפיננסי ומורה AI אישי שמלווה אותך עד הבחינה.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/academy/register" className="inline-flex h-12 items-center rounded-md bg-accent px-6 text-base font-semibold text-white hover:bg-accent-hover">מתחילים ללמוד</Link>
          <Link href="/academy#how" className="inline-flex h-12 items-center rounded-md border border-input px-6 text-base font-semibold text-ink hover:bg-surface">הכירו את המערכת</Link>
        </div>

        {/* Product preview (illustrative) */}
        <div className="mt-14 w-full max-w-[1100px] overflow-hidden rounded-xl border border-line text-right shadow-[0_24px_48px_-24px_rgba(16,24,40,0.25)]">
          <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="ltr mr-4 rounded bg-white px-3 py-0.5 text-xs text-muted">pension-ai.academy</span>
          </div>
          <div className="grid bg-white md:grid-cols-[1fr_220px]">
            <div className="flex flex-col gap-4 p-5 sm:p-8">
              <div className="text-xl font-bold">ברוך הבא, ממשיכים להתקדם.</div>
              <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                <div className="rounded-xl bg-dark p-5 text-white">
                  <div className="text-xs text-faint">המשך מהמקום שעצרת · מימון וסטטיסטיקה</div>
                  <div className="mt-2 text-lg font-bold">ריבית דריבית וערך עתידי</div>
                  <div className="mt-1 text-xs text-faint">יחידה 1 · שיעור 1</div>
                  <div className="mt-4 h-1 rounded bg-white/20"><div className="h-1 w-1/2 rounded bg-white" /></div>
                  <span className="mt-4 inline-flex h-9 items-center rounded-md bg-white px-3 text-sm font-semibold text-ink">המשך שיעור</span>
                </div>
                <div className="rounded-xl border border-accent-line bg-accent-tint p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-accent"><IconSparkle size={14} /> המורה AI</div>
                  <div className="mt-2 text-sm font-semibold leading-relaxed">איך מזינים הפקדה חודשית במצב CMPD?</div>
                  <span className="mt-3 inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-semibold text-white">שאלו את המורה</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["השלמת קורס", "38%"], ["דיוק בתרגול", "81%"], ["נושאים לחזרה", "3"]].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-line p-3">
                    <div className="text-xs text-muted">{l}</div>
                    <div className="ltr mt-1 text-start text-xl font-bold">{v}</div>
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-faint">נתוני דוגמה להמחשה</span>
            </div>
            <div className="hidden border-r border-line bg-surface p-4 text-sm md:block">
              {["לוח הבקרה", "תוכנית הלימודים", "תרגול שאלות", "מבחנים וסימולציות", "החשבון שלי"].map((l, i) => (
                <div key={l} className={`rounded-md px-3 py-2 ${i === 0 ? "bg-white font-semibold" : "text-subtle"}`}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1248px] scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[13px] font-semibold text-accent">איך זה עובד</div>
            <h2 className="mt-2 max-w-md text-3xl font-bold leading-tight sm:text-[40px]">ארבעה שלבים, מסלול אחד ברור עד הבחינה</h2>
          </div>
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">כל שלב בנוי על הקודם. לוח הבקרה מראה איפה אתם עומדים ומה השלב הבא.</p>
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

      {/* Course */}
      <section id="course" className="scroll-mt-16 bg-surface">
        <div className="mx-auto grid max-w-[1248px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="text-[13px] font-semibold text-accent">המסלול הזמין</div>
            <h2 className="text-3xl font-bold sm:text-[40px]">{course?.title ?? "מימון וסטטיסטיקה"}</h2>
            <p className="text-[17px] leading-relaxed text-muted">
              קורס מלא לקראת בחינת הרישוי: מתמטיקה פיננסית, סטטיסטיקה והסתברות, כולל קומבינטוריקה כחלק מפרק ההסתברות.
            </p>
            <dl className="mt-2 divide-y divide-line border-y border-line text-[15px]">
              {[["מימון", "ריבית, ערך עתידי ונוכחי, קצבאות, החזרי הלוואות"], ["סטטיסטיקה והסתברות", "מדדים, התפלגויות, הסתברות, קומבינטוריקה"], ["מחשבון פיננסי", "הדרכה מעשית צעד אחר צעד ב-CASIO FC-200V"]].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
                  <dt className="w-40 shrink-0 font-semibold">{k}</dt>
                  <dd className="text-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/academy/register" className="mt-2 inline-flex h-11 w-fit items-center rounded-md bg-dark px-5 text-[15px] font-semibold text-white hover:bg-black">להרשמה ולשיעור הראשון</Link>
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-line bg-white p-6">
              <span className="rounded-md bg-success-soft px-2 py-1 text-xs font-semibold text-success-ink">זמין עכשיו</span>
              <div className="mt-3 text-xl font-bold">{course?.title ?? "מימון וסטטיסטיקה"}</div>
              <div className="mt-1 text-sm text-muted">
                {Number(counts?.lessons ?? 0)} שיעורים פתוחים · {Number(counts?.questions ?? 0)} שאלות תרגול מאושרות · מבחני פרק וסימולציות
              </div>
              <ol className="mt-5 divide-y divide-line-soft border-t border-line-soft">
                {syllabus?.units.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-3 text-[15px]">
                    <span>{u.title}</span>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${u.status === "published" ? "bg-success-soft text-success-ink" : "bg-line-soft text-subtle"}`}>{u.status === "published" ? "פתוח" : "בהכנה"}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-[1248px] px-4 py-20 sm:px-6">
        <div className="text-[13px] font-semibold text-accent">חוויית הלמידה</div>
        <h2 className="mt-2 text-3xl font-bold sm:text-[40px]">שיעור, תרגול ומורה. באותו מסך.</h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex aspect-[16/10] items-center justify-center bg-dark">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 text-white"><IconPlay size={20} /></span>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-bold">שיעורים ממוקדים</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">כל שיעור מגיע עם סיכום, נוסחאות, דוגמאות פתורות ותרגול קשור.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex aspect-[16/10] flex-col justify-center gap-2 bg-surface p-5 text-sm">
              <div className="w-4/5 rounded-xl border border-line bg-white px-3 py-2">אני כאן כדי לעזור לך להבין את השאלה. נתחיל בזיהוי הנתונים?</div>
              <div className="mr-auto rounded-xl bg-dark px-3 py-2 text-white">למה מחלקים את הריבית ב־12?</div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {["תן לי רמז", "הסבר את הנוסחה", "איך פותרים במחשבון?"].map((c) => <span key={c} className="rounded-md border border-accent-line bg-white px-2 py-1 text-accent">{c}</span>)}
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-bold">מורה AI שמכיר את השאלה</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">מקבל את הקשר השיעור או השאלה, ומוביל אתכם לפתרון במקום לתת אותו מיד.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-surface">
              <div className="origin-center scale-[0.44]">
                <CalculatorFace hot={["SOLVE"]} top="CMPD" main="FV=16288.94627" />
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-bold">פתרון במחשבון פיננסי</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">רצף מקשים מודגש, צעד אחר צעד, כמו שיעור פרטי ליד השולחן.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Practice & tracking */}
      <section className="bg-dark text-white">
        <div className="mx-auto grid max-w-[1248px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="text-[13px] font-semibold text-brand-300">תרגול, סימולציות ומעקב</div>
            <h2 className="text-3xl font-bold leading-tight sm:text-[40px]">יודעים בדיוק מה עוד צריך לחזק</h2>
            <p className="text-[17px] leading-relaxed text-faint">סימולציות בתנאי בחינה, דיוק לפי נושא ונושאים לחזרה שמתעדכנים אחרי כל תרגול.</p>
            <ul className="mt-2 flex flex-col gap-2 text-[15px]">
              {["שעון בחינה וציון מיידי", "דיוק לפי שיעור ונושא", "חזרה ממוקדת על נושאים חלשים"].map((t) => (
                <li key={t} className="flex items-center gap-2"><IconCheck size={16} className="text-brand-300" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex items-center justify-between">
              <span className="font-semibold">שליטה לפי נושא</span>
              <span className="text-xs text-faint">נתוני דוגמה</span>
            </div>
            <div className="flex flex-col gap-4">
              {MASTERY_DEMO.map(([t, v]) => (
                <div key={t} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-sm"><span>{t}</span><span className="ltr">{v}%</span></div>
                  <div className="h-1.5 rounded bg-white/10"><div className={`h-1.5 rounded ${v >= 70 ? "bg-white" : "bg-brand-300"}`} style={{ width: `${v}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-[1248px] scroll-mt-16 px-4 py-20 text-center sm:px-6">
        <div className="text-[13px] font-semibold text-accent">מחירים</div>
        <h2 className="mt-2 text-3xl font-bold sm:text-[40px]">מנוי פשוט ושקוף</h2>
        <p className="mt-3 text-[17px] text-muted">גישה מלאה לקורס, עם תקופת ניסיון חינם.</p>
        <div className="mx-auto mt-10 max-w-md rounded-xl border-2 border-ink p-7 text-right">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">מנוי חודשי</span>
            {course && <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-hover">{course.trial_days} ימי ניסיון</span>}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold">{course ? `${course.price_ils} ₪` : ""}</span>
            <span className="text-muted">לחודש</span>
          </div>
          <ul className="mt-6 flex flex-col gap-2.5 border-t border-line pt-5 text-[15px]">
            {["גישה מלאה לשיעורים ולתרגול", "מבחני פרק וסימולציות בחינה", "פתרון במחשבון הפיננסי לכל שאלת חישוב", "מורה AI אישי", "ביטול בכל עת"].map((f) => (
              <li key={f} className="flex items-center gap-2"><IconCheck size={16} className="text-success" /> {f}</li>
            ))}
          </ul>
          <Link href="/academy/register" className="mt-7 flex h-12 items-center justify-center rounded-md bg-dark text-base font-semibold text-white hover:bg-black">מתחילים בתקופת ניסיון</Link>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 bg-surface">
        <div className="mx-auto grid max-w-[1248px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <div className="text-[13px] font-semibold text-accent">שאלות נפוצות</div>
            <h2 className="mt-2 text-3xl font-bold sm:text-[40px]">לפני שמתחילים</h2>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a], i) => (
              <details key={q} className="group py-5" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                  {q}
                  <span className="text-muted transition-transform group-open:rotate-180">▾</span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-[1248px] px-4 py-24 text-center sm:px-6">
        <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight sm:text-[48px]">הבחינה מתקרבת. ההכנה יכולה להתחיל היום.</h2>
        <Link href="/academy/register" className="mt-8 inline-flex h-12 items-center rounded-md bg-accent px-7 text-base font-semibold text-white hover:bg-accent-hover">מתחילים ללמוד</Link>
      </section>
    </div>
  );
}
