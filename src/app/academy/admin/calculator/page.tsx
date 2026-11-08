import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { getCalculator } from "@/academy/calculator";
import { listFacts } from "@/academy/services/facts";
import { LearningService } from "@/academy/services/learning";
import ActionForm from "@/components/academy/admin/ActionForm";
import { KeyCap } from "@/components/academy/CalculatorSteps";
import { Badge, Card } from "@/components/academy/ui";

export default async function CalculatorFacts() {
  await requireStaff();
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const model = course?.calculator_model ?? "casio-fc-200v";
  const facts = await listFacts(db, model);
  const { model: definition } = getCalculator(model);
  const confirmed = facts.filter((f) => f.status === "confirmed").length;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-extrabold">אימות עובדות המחשבון: {definition.name}</h2>
        <p className="mt-1 text-sm text-slate-600">
          כל רצף מקשים בקורס נשען על העובדות שלמטה. רצף מוצג לתלמידים רק כשכל העובדות שהוא תלוי בהן אומתו, והסימולטור הדטרמיניסטי משחזר את כל התצוגות שלו. אמתו כל עובדה מול מדריך המשתמש הרשמי (FC-200V/FC-100V User&apos;s Guide) או על המחשבון עצמו, וציינו עמוד או סעיף.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={confirmed === facts.length ? "green" : "amber"}>{confirmed}/{facts.length} אומתו</Badge>
          <span className="text-xs text-slate-500">דגם הקורס ניתן לשינוי. דגם אחר דורש הגדרת מקשים ועובדות משלו.</span>
        </div>
      </Card>
      {facts.map((fact) => (
        <Card key={fact.key}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="ltr text-xs text-slate-500">{fact.key}</code>
            <div className="flex gap-2">
              <Badge tone={fact.sourced ? "blue" : "amber"}>{fact.sourced ? "יש מקור משני" : "ללא מקור. לבדוק על המחשבון"}</Badge>
              <Badge tone={fact.status === "confirmed" ? "green" : fact.status === "rejected" ? "red" : "slate"}>
                {fact.status === "confirmed" ? "אומת" : fact.status === "rejected" ? "נדחה" : "ממתין"}
              </Badge>
            </div>
          </div>
          <p className="mt-2 font-semibold text-slate-900">{fact.statement}</p>
          <p className="ltr mt-1 text-start text-xs text-slate-500">{fact.source}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.values(definition.keys).filter((k) => k.factKey === fact.key).map((k) => <KeyCap key={k.id} id={k.id} />)}
          </div>
          {fact.reviewed_at && (
            <p className="mt-2 text-xs text-slate-600">נבדק ב-{new Date(fact.reviewed_at).toLocaleString("he-IL")} על ידי {fact.reviewer_email} · {fact.manual_ref}{fact.note ? ` · ${fact.note}` : ""}</p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-bold text-brand-700">{fact.status === "pending" ? "רישום תוצאת בדיקה" : "עדכון"}</summary>
            <div className="mt-2 max-w-xl">
              <ActionForm action="fact.review" payload={{ factKey: fact.key }} submitLabel="שמירה"
                fields={[
                  { name: "status", label: "תוצאה", type: "select", options: [["confirmed", "מאומת: תואם למדריך או למחשבון"], ["rejected", "שגוי: לא תואם"]] },
                  { name: "manualRef", label: "מקור הבדיקה (עמוד או סעיף במדריך, או 'נבדק על המחשבון')", required: true },
                  { name: "note", label: "הערה (לא חובה)", type: "textarea" },
                ]} />
            </div>
          </details>
        </Card>
      ))}
    </div>
  );
}
