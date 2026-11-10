import { requireStaff } from "@/academy/auth/session";
import { getConfig } from "@/academy/config";
import { getDb } from "@/academy/db";
import { BillingService, formatIls, PLAN_KIND_LABEL } from "@/academy/billing/service";
import { getPaymentProvider } from "@/academy/billing/payment-provider";
import { LearningService } from "@/academy/services/learning";
import ActionButton from "@/components/academy/admin/ActionButton";
import ActionForm from "@/components/academy/admin/ActionForm";
import { Badge, Card } from "@/components/academy/ui";

/** Billing management: plans, coupons, orders, webhook events, reconciliation. */
export default async function AdminBilling() {
  const me = await requireStaff();
  const db = await getDb();
  const providerName = getConfig().payments.provider;
  const provider = getPaymentProvider(providerName);
  const billing = new BillingService(db, providerName);
  const course = await new LearningService(db).getCourse();
  const plans = course ? await billing.plans(course.id, false) : [];
  const coupons = await billing.coupons();
  const orders = await billing.orders(100);
  const events = await billing.paymentEvents(30);
  const isAdmin = me.role === "admin";
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-extrabold">מסלולים ותשלומים</h1>
        <p className="mt-1 text-sm text-muted">
          ספק סליקה: {provider.available ? <Badge tone="green">{provider.name}</Badge> : <Badge tone="amber">לא מוגדר</Badge>}. עד לחיבור ספק מאומת אין תשלום מקוון באתר.
          גישה נפתחת רק מ-Webhook חתום של הספק, מקופון של 100%, או בהענקה ידנית עם אסמכתא בעמוד ״תלמידים וגישה״.
        </p>
        {isAdmin && <div className="mt-3"><ActionButton action="billing.reconcile" label="התאמת תשלומים ומנויים" variant="secondary" /></div>}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">מסלולים</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">{p.title}</span>
                <Badge tone={p.active ? "green" : "slate"}>{p.active ? "פעיל" : "כבוי"}</Badge>
              </div>
              <div className="mt-1 text-sm text-muted">{PLAN_KIND_LABEL[p.kind]} · <span className="ltr">{formatIls(p.price_agorot)}</span>{p.access_days ? ` · ${p.access_days} ימים` : ""}</div>
              {isAdmin && (
                <div className="mt-3">
                  <ActionForm action="plan.update" payload={{ planId: p.id }} submitLabel="שמירה" variant="secondary" resetOnSuccess={false}
                    fields={[
                      { name: "title", label: "שם", defaultValue: p.title },
                      { name: "priceIls", label: "מחיר (₪, כולל מע״מ)", type: "number", defaultValue: String(p.price_agorot / 100) },
                      ...(p.kind === "one_time" ? [{ name: "accessDays", label: "ימי גישה", type: "number" as const, defaultValue: p.access_days ? String(p.access_days) : "" }] : []),
                      { name: "active", label: "מוצג באתר", type: "checkbox", defaultValue: !!p.active },
                    ]} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">קופונים</h2>
        {coupons.length > 0 && (
          <table className="mb-4 w-full text-sm">
            <thead className="text-muted"><tr><th className="py-2 text-start font-medium">קוד</th><th className="py-2 text-start font-medium">הנחה</th><th className="py-2 text-start font-medium">שימושים</th><th className="py-2 text-start font-medium">תוקף</th><th /></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code} className="border-t border-line">
                  <td className="ltr py-2 text-start font-semibold">{c.code}</td>
                  <td className="py-2">{c.kind === "percent" ? `${c.value}%` : formatIls(c.value)}</td>
                  <td className="py-2">{c.redemptions}{c.max_redemptions !== null ? `/${c.max_redemptions}` : ""}</td>
                  <td className="py-2">{c.valid_until ? new Date(c.valid_until).toLocaleDateString("he-IL") : "ללא"}</td>
                  <td className="py-2">{isAdmin && <ActionButton action="coupon.active" payload={{ code: c.code, active: !c.active }} label={c.active ? "השבתה" : "הפעלה"} variant="ghost" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isAdmin && (
          <details>
            <summary className="cursor-pointer text-sm font-bold text-accent">קופון חדש</summary>
            <div className="mt-3 max-w-md">
              <ActionForm action="coupon.create" submitLabel="יצירה"
                fields={[
                  { name: "code", label: "קוד", required: true, placeholder: "WELCOME10" },
                  { name: "kind", label: "סוג", type: "select", options: [["percent", "אחוז הנחה"], ["amount", "סכום קבוע (₪)"]] },
                  { name: "value", label: "ערך", type: "number", required: true },
                  { name: "planId", label: "מסלול", type: "select", options: [["", "כל המסלולים"], ...plans.map((p) => [p.id, p.title] as [string, string])] },
                  { name: "validUntil", label: "בתוקף עד", type: "date" },
                  { name: "maxRedemptions", label: "מספר שימושים מרבי", type: "number" },
                ]} />
            </div>
          </details>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">הזמנות</h2>
        {orders.length === 0 ? <p className="text-sm text-muted">אין הזמנות.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted"><tr><th className="py-2 text-start font-medium">תאריך</th><th className="py-2 text-start font-medium">תלמיד</th><th className="py-2 text-start font-medium">מסלול</th><th className="py-2 text-start font-medium">סכום</th><th className="py-2 text-start font-medium">קופון</th><th className="py-2 text-start font-medium">סטטוס</th><th className="py-2 text-start font-medium">ספק</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-line">
                    <td className="py-2">{new Date(o.created_at).toLocaleString("he-IL")}</td>
                    <td className="ltr py-2 text-start">{o.email}</td>
                    <td className="py-2">{o.plan_title}</td>
                    <td className="ltr py-2 text-start">{formatIls(o.amount_agorot)}</td>
                    <td className="ltr py-2 text-start">{o.coupon_code ?? ""}</td>
                    <td className="py-2"><Badge tone={o.status === "paid" ? "green" : o.status === "pending" ? "amber" : "slate"}>{o.status}</Badge></td>
                    <td className="py-2">{o.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">אירועי תשלום (Webhooks)</h2>
        {events.length === 0 ? <p className="text-sm text-muted">אין אירועים.</p> : (
          <ul className="divide-y divide-line text-sm">
            {events.map((e) => (
              <li key={`${e.provider}-${e.event_id}`} className="flex flex-wrap gap-3 py-2">
                <span className="text-muted">{new Date(e.received_at).toLocaleString("he-IL")}</span>
                <span className="ltr">{e.provider} · {e.type} · {e.event_id}</span>
                <Badge tone={e.status === "processed" ? "green" : e.status === "failed" ? "red" : "slate"}>{e.status}</Badge>
                {e.error && <span className="text-danger-ink">{e.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
