import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AssignmentService } from "@/academy/services/assignments";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import { Badge, Card } from "@/components/academy/ui";

export default async function AdminAssignment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaff();
  const db = await getDb();
  const service = new AssignmentService(db);
  const detail = await service.adminDetail(id);
  if (!detail) notFound();
  const { assignment: a, items, checks, versions } = detail;
  const report = await service.gradeReport(id);
  const lessonQuestions = await db.all<{ id: string; stem_md: string; status: string }>(
    "SELECT id, stem_md, status FROM questions WHERE lesson_id = ? AND id NOT IN (SELECT question_id FROM assignment_items WHERE assignment_id = ?) ORDER BY position",
    [a.lesson_id, id],
  );
  const isAdmin = me.role === "admin";
  const ready = checks.every((c) => c.ok);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/academy/admin/assignments" className="text-sm text-muted">← מטלות</Link>
            <h1 className="mt-1 text-xl font-extrabold">{a.title}</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-sm">
              {a.status === "published" ? <Badge tone="green">פורסמה · גרסה {a.version}</Badge> : <Badge>טיוטה{a.version ? ` · גרסה אחרונה ${a.version}` : ""}</Badge>}
              <span className="text-muted">מדיניות פתרונות: {a.solution_policy === "anytime" ? "בכל שלב (נועל תשובה)" : a.solution_policy === "after_answer" ? "אחרי בחירת תשובה" : "אחרי ההגשה"}</span>
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <ActionButton action="assignment.publish" payload={{ assignmentId: id }} label={a.version ? "פרסום גרסה חדשה" : "פרסום המטלה"} variant="primary" confirm="לפרסם? גרסאות השאלות הנוכחיות יקובעו לכל התלמידים." />
              {a.status === "published" && <ActionButton action="assignment.unpublish" payload={{ assignmentId: id }} label="הסרה מפרסום" variant="ghost" confirm="להסיר את המטלה מהתלמידים? הגשות קודמות נשמרות." />}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">בדיקות לפני פרסום</h2>
        <ul className="space-y-1.5 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className={c.ok ? "text-success" : "text-danger"}>{c.ok ? "✓" : "✗"}</span>
              <span className="font-semibold">{c.label}</span>
              <span className="text-muted">· {c.detail}</span>
            </li>
          ))}
        </ul>
        {!ready && <p className="mt-3 text-sm text-muted">אישור שאלות נעשה בעמוד השיעור ב״שיעורים ומאגר שאלות״.</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">שאלות ({items.length})</h2>
        <ol className="divide-y divide-line">
          {items.map((q) => (
            <li key={q.question_id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center">
              <span className="w-8 shrink-0 font-bold">{q.position}</span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm">{q.stem_md}</p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  <Badge tone={q.status === "approved" ? "green" : q.status === "rejected" ? "red" : "amber"}>{q.status === "approved" ? "מאושרת" : q.status === "review" ? "בבדיקה" : q.status}</Badge>
                  <Badge tone={q.verification_status === "verified" || q.verification_status === "not_applicable" ? "green" : "red"}>אימות: {q.verification_status === "verified" ? "עבר" : q.verification_status === "not_applicable" ? "לא חישובית" : "נכשל"}</Badge>
                  <Badge>גרסה {q.version}{q.pinnedVersion ? ` · בפרסום: ${q.pinnedVersion}` : ""}</Badge>
                  {q.changedSinceApproval && <Badge tone="amber">שונתה מאז האישור</Badge>}
                  <Badge tone={q.video_id ? "green" : "slate"}>{q.video_id ? "יש סרטון פתרון" : "אין סרטון פתרון"}</Badge>
                  <span className="text-muted">ניקוד: {q.points ?? "שווה"}</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 flex-wrap items-start gap-2">
                  <div className="w-40"><ActionForm action="assignment.points" payload={{ assignmentId: id, questionId: q.question_id }} submitLabel="ניקוד" variant="secondary" resetOnSuccess={false} fields={[{ name: "points", label: "", type: "number", defaultValue: q.points === null ? "" : String(q.points), placeholder: "שווה" }]} /></div>
                  <ActionButton action="assignment.removeItem" payload={{ assignmentId: id, questionId: q.question_id }} label="הסרה" variant="ghost" confirm="להסיר את השאלה מהמטלה (בגרסה הבאה)?" />
                </div>
              )}
            </li>
          ))}
        </ol>
        {isAdmin && lessonQuestions.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-bold text-accent">הוספת שאלה מהשיעור ({lessonQuestions.length})</summary>
            <ul className="mt-2 space-y-2">
              {lessonQuestions.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="line-clamp-1">{q.stem_md}</span>
                  <ActionButton action="assignment.addItem" payload={{ assignmentId: id, questionId: q.id }} label="הוספה" variant="ghost" />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {isAdmin && (
        <Card>
          <h2 className="mb-3 text-lg font-bold">הגדרות</h2>
          <div className="max-w-md">
            <ActionForm
              action="assignment.settings"
              payload={{ assignmentId: id }}
              submitLabel="שמירה"
              resetOnSuccess={false}
              fields={[
                { name: "title", label: "שם המטלה", defaultValue: a.title },
                { name: "questionCount", label: "מספר שאלות נדרש", type: "number", defaultValue: String(a.question_count) },
                { name: "solutionPolicy", label: "צפייה בפתרון", type: "select", defaultValue: a.solution_policy, options: [["anytime", "בכל שלב (נועל את התשובה לשאלה)"], ["after_answer", "אחרי בחירת תשובה"], ["after_submit", "רק אחרי ההגשה"]] },
                { name: "allowRetake", label: "לאפשר תרגול חוזר אחרי ההגשה", type: "checkbox", defaultValue: !!a.allow_retake },
              ]}
            />
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-bold">דוח ציונים (הגשה רשמית)</h2>
        {report.length === 0 ? <p className="text-sm text-muted">אין הגשות עדיין.</p> : (
          <table className="w-full text-sm">
            <thead className="text-muted"><tr><th className="py-2 text-start font-medium">תלמיד</th><th className="py-2 text-start font-medium">ציון</th><th className="py-2 text-start font-medium">נכונות</th><th className="py-2 text-start font-medium">תרגולים</th><th className="py-2 text-start font-medium">תאריך</th></tr></thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.user_id} className="border-t border-line">
                  <td className="py-2">{r.full_name || r.email}</td>
                  <td className="py-2 font-bold">{r.score}</td>
                  <td className="ltr py-2 text-start">{r.correct_count}/{r.total_count}</td>
                  <td className="py-2">{Number(r.practice_attempts)}</td>
                  <td className="py-2 text-muted">{new Date(r.submitted_at).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {versions.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-bold">גרסאות שפורסמו</h2>
          <ul className="text-sm">
            {versions.map((v) => <li key={v.version} className="py-1">גרסה {v.version} · {new Date(v.published_at).toLocaleString("he-IL")} · {v.email ?? ""}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
