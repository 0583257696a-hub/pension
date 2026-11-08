import { requireUser } from "@/academy/auth/session";
import { getConfig } from "@/academy/config";
import { getDb } from "@/academy/db";
import { getPaymentProvider } from "@/academy/billing/payment-provider";
import { LearningService } from "@/academy/services/learning";
import BillingActions from "@/components/academy/BillingActions";
import { Card, PageTitle } from "@/components/academy/ui";

const STATUS: Record<string, string> = { trial: "תקופת ניסיון", active: "פעיל", canceled: "בוטל (פעיל עד סוף התקופה)", expired: "הסתיים" };

export default async function AccountPage() {
  const user = await requireUser("/academy/account");
  const service = new LearningService(await getDb());
  const course = await service.getCourse();
  if (!course) return <p>הקורס עדיין לא הוגדר.</p>;
  const entitlement = await service.getEntitlement(user, course.id);
  const sub = entitlement.subscription;
  const provider = getPaymentProvider(getConfig().payments.provider);
  const end = sub ? (sub.status === "trial" ? sub.trial_ends_at : sub.current_period_end) : null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title="המנוי שלי" subtitle={course.title} />
      <Card>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">שם</dt><dd className="font-semibold">{user.full_name}</dd></div>
          <div><dt className="text-slate-500">אימייל</dt><dd className="ltr text-start font-semibold">{user.email}</dd></div>
          <div><dt className="text-slate-500">סטטוס</dt><dd className="font-semibold">{entitlement.reason === "staff" ? "צוות" : sub ? STATUS[sub.status] : "חשבון חינמי"}</dd></div>
          <div><dt className="text-slate-500">בתוקף עד</dt><dd className="font-semibold">{end ? new Date(end).toLocaleDateString("he-IL") : "-"}</dd></div>
          <div><dt className="text-slate-500">מחיר מנוי</dt><dd className="font-semibold">{course.price_ils} ₪ לחודש</dd></div>
          <div><dt className="text-slate-500">תקופת ניסיון</dt><dd className="font-semibold">{course.trial_days} ימים</dd></div>
        </dl>
      </Card>
      {entitlement.reason !== "staff" && (
        <Card>
          <BillingActions
            canStartTrial={!sub}
            canCancel={!!sub && (sub.status === "active" || sub.status === "trial") && entitlement.hasAccess}
            checkoutAvailable={provider.available}
          />
        </Card>
      )}
    </div>
  );
}
