import Link from "next/link";
import { requireUser } from "@/academy/auth/session";
import { getConfig } from "@/academy/config";
import { getDb } from "@/academy/db";
import { EntitlementService } from "@/academy/billing/entitlements";
import { BillingService, formatIls } from "@/academy/billing/service";
import { LearningService } from "@/academy/services/learning";
import { CancelSubscription } from "@/components/academy/BillingActions";
import { Badge, btn, Card, CardTitle, PageTitle } from "@/components/academy/ui";

const SOURCE: Record<string, string> = { purchase: "רכישה", subscription: "מנוי", admin: "הוענק על ידי הצוות", coupon: "קופון", legacy: "גישה קודמת" };
const ORDER: Record<string, string> = { pending: "ממתין לתשלום", paid: "שולם", failed: "נכשל", canceled: "בוטל", refunded: "הוחזר" };

/** Subscription account (spec §4, §29): active courses, access expiry, subscription and payment records. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  const user = await requireUser("/academy/account");
  const db = await getDb();
  const service = new LearningService(db);
  const course = await service.getCourse();
  const entitlement = course ? await service.getEntitlement(user, course.id) : null;
  const grants = await new EntitlementService(db).listForUser(user.id);
  const billing = new BillingService(db, getConfig().payments.provider);
  const orders = await billing.ordersForUser(user.id);
  const pendingOrder = order ? orders.find((o) => o.id === order) : null;
  const sub = entitlement?.subscription ?? null;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageTitle title="החשבון שלי" subtitle={user.email} />
      {pendingOrder && (
        <Card>
          {pendingOrder.status === "paid" ? (
            <p className="text-[15px] text-success-ink">התשלום התקבל והגישה לקורס פתוחה.</p>
          ) : (
            <p className="text-[15px] text-body">ההזמנה התקבלה. הגישה תיפתח ברגע שחברת הסליקה תאשר את התשלום (בדרך כלל תוך דקה). אפשר לרענן את הדף.</p>
          )}
        </Card>
      )}
      <Card>
        <CardTitle>הגישה שלי</CardTitle>
        {entitlement?.reason === "staff" ? (
          <p className="text-[15px] text-body">חשבון צוות: גישה לכל התוכן.</p>
        ) : entitlement?.hasAccess ? (
          <div className="flex flex-col gap-2 text-[15px]">
            <div className="flex items-center gap-2"><Badge tone="green">פעילה</Badge> <span className="font-semibold text-ink">{course?.title}</span></div>
            <div className="text-muted">{entitlement.endsAt ? `בתוקף עד ${new Date(entitlement.endsAt).toLocaleDateString("he-IL")}` : "ללא הגבלת זמן"}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-body">{entitlement?.reason === "expired" ? "הגישה לקורס הסתיימה." : "עדיין אין גישה לקורס. השיעור הראשון פתוח לצפייה."}</p>
            <Link className={btn.primary} href="/academy/pricing">לרכישת הקורס</Link>
          </div>
        )}
      </Card>
      {sub && (
        <Card>
          <CardTitle>מנוי</CardTitle>
          <dl className="divide-y divide-line-soft text-[15px]">
            <div className="flex justify-between py-2"><dt className="text-muted">סטטוס</dt><dd className="font-semibold">{sub.status === "active" ? "פעיל, מתחדש אוטומטית" : sub.status === "canceled" ? "החידוש בוטל" : sub.status === "expired" ? "הסתיים" : sub.status}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted">סוף התקופה הנוכחית</dt><dd>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("he-IL") : "—"}</dd></div>
          </dl>
          {sub.status === "active" && <div className="mt-3"><CancelSubscription subscriptionId={sub.id} /></div>}
        </Card>
      )}
      {grants.length > 0 && (
        <Card>
          <CardTitle>היסטוריית גישה</CardTitle>
          <ul className="divide-y divide-line-soft text-[15px]">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{g.course_title} · {SOURCE[g.source] ?? g.source}</span>
                <span className="text-muted">{g.status === "revoked" ? "בוטלה" : g.expires_at ? `עד ${new Date(g.expires_at).toLocaleDateString("he-IL")}` : "ללא הגבלה"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {orders.length > 0 && (
        <Card>
          <CardTitle>הזמנות ותשלומים</CardTitle>
          <ul className="divide-y divide-line-soft text-[15px]">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{o.plan_title} · {new Date(o.created_at).toLocaleDateString("he-IL")}</span>
                <span><span className="ltr">{formatIls(o.amount_agorot)}</span> · {ORDER[o.status]}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
