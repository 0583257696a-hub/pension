import Link from "next/link";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";

/** Course catalog. Only produced, published courses are listed. */
export default async function CatalogPage() {
  const courses = await new LearningService(await getDb()).listCourses();
  return (
    <div className="mx-auto max-w-[1248px] px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-[40px]">קורסים</h1>
      <p className="mt-2 text-[17px] text-muted">קורסים נוספים יתווספו כשיסתיימו ההפקה והבדיקה המקצועית שלהם.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {courses.map((c) => (
          <Link key={c.id} href={`/academy/courses/${c.slug}`} className="flex flex-col gap-2 rounded-xl border border-line p-6 hover:border-input">
            <span className="w-fit rounded-md bg-success-soft px-2 py-1 text-xs font-semibold text-success-ink">זמין</span>
            <span className="text-2xl font-bold text-ink">{c.title}</span>
            <span className="text-[15px] text-muted">{c.subtitle}</span>
            <span className="mt-2 text-sm font-semibold text-accent">לפרטי הקורס</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
