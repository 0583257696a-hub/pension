import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import { IconChevronLeft } from "@/components/academy/icons";
import { Badge, btn, Card, CardTitle, PageTitle, Progress } from "@/components/academy/ui";

/** "הקורסים שלי" (spec §4 step 3): courses, progress, assignment grades. Deliberately simple. */
export default async function MyCoursesPage() {
  const user = await requireUser("/academy/dashboard");
  const courses = await new LearningService(await getDb()).getMyCourses(user);
  const firstName = user.full_name.split(" ")[0] || "";

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title={firstName ? `שלום ${firstName}` : "הקורסים שלי"} subtitle="כאן נמצאים הקורסים שלך, ההתקדמות והציונים במטלות." />
      {courses.map(({ course, entitlement, publishedLessons, completedLessons, next, grades }) => {
        const pct = publishedLessons ? (completedLessons / publishedLessons) * 100 : 0;
        return (
          <div key={course.id} className="flex flex-col gap-6">
            <Card>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-ink">{course.title}</h2>
                    {entitlement.hasAccess ? <Badge tone="green">גישה פעילה</Badge> : <Badge tone="slate">שיעור לדוגמה פתוח</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    הושלמו {completedLessons} מתוך {publishedLessons} שיעורים
                    {entitlement.endsAt ? ` · הגישה בתוקף עד ${new Date(entitlement.endsAt).toLocaleDateString("he-IL")}` : ""}
                  </p>
                  <div className="mt-3 max-w-md"><Progress value={pct} /></div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {next && <Link className={btn.dark} href={`/academy/lesson/${next.slug}`}>להמשך: שיעור {next.number}</Link>}
                  <Link className={btn.secondary} href="/academy/course">לכל השיעורים</Link>
                </div>
              </div>
              {!entitlement.hasAccess && (
                <div className="mt-5 flex flex-col gap-3 rounded-md bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[15px] text-body">השיעור הראשון פתוח לצפייה. לשאר השיעורים והמטלות יש לרכוש את הקורס.</p>
                  <Link className={btn.primary} href="/academy/pricing">לרכישת הקורס</Link>
                </div>
              )}
            </Card>

            <Card>
              <CardTitle action={<Link href="/academy/grades" className={btn.ghost}>כל הציונים <IconChevronLeft size={16} /></Link>}>ציונים במטלות</CardTitle>
              {grades.length ? (
                <ul className="divide-y divide-line">
                  {grades.map((g) => (
                    <li key={g.attemptId} className="flex items-center justify-between gap-3 py-3">
                      <span className="text-[15px] text-ink">{g.title}</span>
                      <span className="flex items-center gap-3">
                        <span className="ltr text-lg font-bold text-ink">{g.score}</span>
                        <Link href={`/academy/attempts/${g.attemptId}/results`} className="text-sm font-semibold text-accent">לתוצאות</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-muted">עדיין לא הוגשו מטלות. אחרי כל שיעור מחכה מטלה של 20 שאלות.</p>
              )}
            </Card>
          </div>
        );
      })}
    </div>
  );
}
