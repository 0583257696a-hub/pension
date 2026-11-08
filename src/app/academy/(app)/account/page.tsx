import { requireUser } from "@/academy/auth/session";
import { getConfig } from "@/academy/config";
import { getDb } from "@/academy/db";
import { getPaymentProvider } from "@/academy/billing/payment-provider";
import { LearningService } from "@/academy/services/learning";
import BillingActions from "@/components/academy/BillingActions";
import { Card, CardTitle, PageTitle } from "@/components/academy/ui";

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
  const rows: Array<[string, React.ReactNode]> = [
    ["שם", user.full_name || "—"],
    ["אימייל", <span key="e" className="ltr">{user.email}</span>],
    ["סטטוס", entitlement.reason === "staff" ? "צוות" : sub ? STATUS[sub.status] : "חשבון חינמי"],
    ["בתוקף עד", end ? new Date(end).toLocaleDateString("he-IL") : "—"],
    ["מחיר מנוי", `${course.price_ils} ₪ לחודש`],
    ["תקופת ניסיון", `${course.trial_days} ימים`],
  ];
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageTitle title="החשבון שלי" subtitle={course.title} />
      <Card>
        <CardTitle>פרטי המנוי</CardTitle>
        <dl className="divide-y divide-line-soft border-t border-line-soft text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {entitlement.reason !== "staff" && (
        <Card>
          <CardTitle>ניהול המנוי</CardTitle>
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
