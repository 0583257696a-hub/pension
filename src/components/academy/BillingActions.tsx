"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { btn, input } from "./ui";

interface Plan { id: string; kind: "one_time" | "monthly" | "annual"; title: string; priceLabel: string; note: string }

/**
 * Plan choice, coupon, and checkout on the payment provider's hosted page.
 * Access opens only after the provider's verified webhook (or a 100% coupon),
 * never because this page was reached.
 */
export function Checkout({ plans, checkoutAvailable, signedIn }: { plans: Plan[]; checkoutAvailable: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<{ amount: number; discount: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const applyCoupon = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const q = await api<{ amount: number; discount: number }>("/api/academy/billing", { action: "quote", planId, coupon });
      setQuote(q);
      setMessage({ tone: "ok", text: `הקופון הוחל: הנחה של ${(q.discount / 100).toLocaleString("he-IL")} ₪` });
    } catch (e) {
      setQuote(null);
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!signedIn) {
      router.push(`/academy/register?next=${encodeURIComponent("/academy/pricing")}`);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ granted: boolean; redirectUrl?: string }>("/api/academy/billing", { action: "checkout", planId, coupon: coupon || undefined });
      if (res.redirectUrl) {
        window.location.assign(res.redirectUrl);
        return;
      }
      if (res.granted) {
        router.push("/academy/dashboard");
        router.refresh();
      }
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setBusy(false);
    }
  };

  if (!plans.length) return <p className="text-[15px] text-muted">מסלולי הרכישה יפורסמו בקרוב.</p>;
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">בחירת מסלול</legend>
        {plans.map((p) => (
          <label key={p.id} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 ${planId === p.id ? "border-ink ring-2 ring-line" : "border-line"}`}>
            <input type="radio" name="plan" className="sr-only" checked={planId === p.id} onChange={() => { setPlanId(p.id); setQuote(null); }} />
            <span className="text-[15px] font-bold text-ink">{p.title}</span>
            <span className="ltr text-start text-2xl font-extrabold text-ink">{p.priceLabel}</span>
            <span className="text-xs text-muted">{p.note}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <label htmlFor="coupon" className="text-sm text-muted">קוד קופון</label>
          <input id="coupon" className={`${input} ltr mt-1`} value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
        </div>
        <button type="button" className={btn.secondary} disabled={busy || !coupon} onClick={applyCoupon}>החלת קופון</button>
      </div>
      {quote && <p className="text-[15px] text-ink">לתשלום: <span className="ltr font-bold">{(quote.amount / 100).toLocaleString("he-IL")} ₪</span></p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} disabled={busy || (!checkoutAvailable && !(quote && quote.amount === 0))} onClick={pay}>
          {signedIn ? (quote?.amount === 0 ? "קבלת גישה" : "למעבר לתשלום מאובטח") : "הרשמה ורכישה"}
        </button>
        {!checkoutAvailable && <span className="text-sm text-muted">תשלום מקוון ייפתח בקרוב. עד אז אפשר לרכוש דרך <a className="font-semibold text-accent" href="/academy/contact">יצירת קשר</a>.</span>}
      </div>
      {message && <p className={`text-sm ${message.tone === "error" ? "text-danger-ink" : "text-success-ink"}`} role="status">{message.text}</p>}
      <p className="text-xs text-muted">פרטי האשראי מוזנים בעמוד המאובטח של חברת הסליקה ואינם נשמרים אצלנו.</p>
    </div>
  );
}

export function CancelSubscription({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className={btn.ghost}
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("לבטל את חידוש המנוי? הגישה תישאר עד סוף התקופה ששולמה.")) return;
          setBusy(true);
          try {
            await api("/api/academy/billing", { action: "cancel", subscriptionId });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "שגיאה");
          } finally {
            setBusy(false);
          }
        }}
      >
        ביטול חידוש המנוי
      </button>
      {error && <p className="text-sm text-danger-ink">{error}</p>}
    </div>
  );
}
