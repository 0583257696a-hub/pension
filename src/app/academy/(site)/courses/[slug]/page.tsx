import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/academy/db";
import { PART_TITLES } from "@/academy/content/chapters";
import { LearningService } from "@/academy/services/learning";
import { IconCheck } from "@/components/academy/icons";

/** Course landing page: table of contents (14 chapters, numbered lessons), what each lesson includes, price link. */
export default async function CourseLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = new LearningService(await getDb());
  const course = await service.getCourseBySlug(slug);
  if (!course) notFound();
  const chapters = await service.chapters(course.id);
  const syllabus = await service.getSyllabus(null, course.id);
  const open = (syllabus?.lessons ?? []).filter((l) => l.status === "published");
  const parts = ["finance", "statistics", "investments"] as const;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
      <div className="text-[13px] font-semibold text-accent">קורס</div>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-[44px]">{course.title}</h1>
      <p className="mt-3 max-w-3xl text-[17px] leading-relaxed text-muted">{course.description_md}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/academy/pricing" className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-hover">לרכישה</Link>
        <Link href="/academy/register" className="inline-flex h-11 items-center rounded-md border border-input px-5 text-[15px] font-semibold">לשיעור הראשון בחינם</Link>
      </div>

      <section className="mt-12 grid gap-4 rounded-xl border border-line bg-surface p-6 sm:grid-cols-2">
        <h2 className="text-lg font-bold sm:col-span-2">בכל שיעור</h2>
        {["שאלות השיעור ודף נוסחאות ב-PDF, מעל הסרטון", "סרטון שיעור עם עצירות לתרגול", "מטלה של 20 שאלות אמריקאיות קבועות", "פתרון במחשבון ובנוסחה, וסרטון הסבר קצר לכל שאלה", "ציון לכל מטלה ומעקב התקדמות", "פנייה לצוות בכל שאלה"].map((t) => (
          <div key={t} className="flex items-center gap-2 text-[15px]"><IconCheck size={16} className="text-success" /> {t}</div>
        ))}
      </section>

      {open.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold">שיעורים פתוחים</h2>
          <ol className="mt-4 divide-y divide-line rounded-xl border border-line">
            {open.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 p-4">
                <span className="font-semibold text-ink">{l.title}</span>
                <span className="text-sm text-muted">{l.topics.join(" · ")}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-2xl font-bold">תוכן העניינים</h2>
        <p className="mt-1 text-sm text-muted">14 פרקים. השיעורים נפתחים בהדרגה, כל אחד אחרי בדיקה מקצועית.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {parts.map((part) => (
            <div key={part} className="rounded-xl border border-line p-5">
              <h3 className="text-lg font-bold">{PART_TITLES[part]}</h3>
              <ol className="mt-3 flex flex-col gap-3">
                {chapters.filter((c) => c.part === part).map((c) => (
                  <li key={c.id}>
                    <div className="text-[15px] font-semibold text-ink">{c.number}. {c.title}</div>
                    <div className="text-[13px] leading-relaxed text-muted">{c.topics.join(" · ")}</div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
