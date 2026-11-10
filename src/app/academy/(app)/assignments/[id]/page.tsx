import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { AssignmentService } from "@/academy/services/assignments";
import { AccessDeniedError } from "@/academy/services/learning";
import StartAssignmentButton from "@/components/academy/StartAssignmentButton";
import { btn, Card, PageTitle } from "@/components/academy/ui";

/** Assignment entry: resumes an open attempt, otherwise explains the rules and starts one. */
export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/academy/assignments/${id}`);
  const db = await getDb();
  const service = new AssignmentService(db);
  const assignment = await service.get(id);
  if (!assignment) notFound();
  let list;
  try {
    list = await service.listForStudent(user, assignment.course_id);
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/academy/pricing");
    throw error;
  }
  const entry = list.find((a) => a.id === id);
  if (!entry) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title={assignment.title} subtitle="המטלה עדיין לא פורסמה." />
        <Link className={btn.secondary} href="/academy/assignments">לכל המטלות</Link>
      </div>
    );
  }
  if (!entry.allowed) redirect("/academy/pricing");
  if (entry.inProgress) redirect(`/academy/attempts/${entry.inProgress.attemptId}`);

  const policy = {
    anytime: "אפשר לצפות בפתרון של כל שאלה בכל שלב. אחרי הצפייה התשובה לשאלה ננעלת.",
    after_answer: "אפשר לצפות בפתרון אחרי שבחרתם תשובה. אחרי הצפייה התשובה ננעלת.",
    after_submit: "הפתרונות וסרטוני ההסבר יוצגו אחרי ההגשה.",
  }[assignment.solution_policy];

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title={entry.title} subtitle={entry.lessonTitle} />
      <Card>
        <ul className="flex flex-col gap-2 text-[15px] text-body">
          <li>• {entry.questionCount} שאלות אמריקאיות, ארבע תשובות לכל שאלה.</li>
          <li>• התשובות נשמרות אוטומטית, ואפשר לחזור לשאלות קודמות ולהמשיך מאוחר יותר.</li>
          <li>• {policy}</li>
          <li>• הציון מחושב לפי תשובות נכונות, בסולם 0–100.</li>
          {entry.official && <li>• כבר הגשת את המטלה (ציון {entry.official.score}). ניסיון נוסף הוא תרגול, והציון הרשמי לא ישתנה.</li>}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <StartAssignmentButton assignmentId={id} newAttempt={!!entry.official} label={entry.official ? "התחלת תרגול חוזר" : "התחלת המטלה"} />
          {entry.official && <Link className={btn.secondary} href={`/academy/attempts/${entry.official.attemptId}/results`}>לתוצאות ההגשה</Link>}
        </div>
      </Card>
    </div>
  );
}
