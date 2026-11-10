import { getCurrentUser } from "@/academy/auth/session";
import { getConfig } from "@/academy/config";
import { getDb } from "@/academy/db";
import { BillingService, formatIls } from "@/academy/billing/service";
import { getPaymentProvider } from "@/academy/billing/payment-provider";
import { LearningService } from "@/academy/services/learning";
import { Checkout } from "@/components/academy/BillingActions";

/** Pricing and purchase. Prices and plans are managed in the admin panel. */
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const { canceled } = await searchParams;
  const db = await getDb();
  const course = await new LearningService(db).getCourse();
  const user = await getCurrentUser();
  const providerName = getConfig().payments.provider;
  const plans = course ? await new BillingService(db, providerName).plans(course.id) : [];
  const note = (p: (typeof plans)[number]) =>
    p.kind === "monthly" ? "מתחדש כל חודש, ביטול בכל עת" : p.kind === "annual" ? "מתחדש כל שנה, ביטול בכל עת" : p.access_days ? `גישה ל-${p.access_days} ימים, ללא חידוש` : "גישה ללא הגבלת זמן";
  return (
    <div className="mx-auto max-w-[900px] px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-[40px]">מחירים</h1>
      <p className="mt-2 text-[17px] text-muted">{course?.title}: כל השיעורים, קובצי ה-PDF, המטלות, הפתרונות וסרטוני ההסבר.</p>
      {canceled && <p className="mt-4 rounded-md bg-surface px-4 py-3 text-[15px] text-body">התשלום בוטל. לא חויבתם.</p>}
      <div className="mt-8 rounded-xl border border-line p-6">
        <Checkout
          plans={plans.map((p) => ({ id: p.id, kind: p.kind, title: p.title, priceLabel: formatIls(p.price_agorot), note: note(p) }))}
          checkoutAvailable={getPaymentProvider(providerName).available}
          signedIn={!!user}
        />
      </div>
      <p className="mt-4 text-sm text-muted">המחירים כוללים מע״מ כחוק. השיעור הראשון פתוח לצפייה אחרי הרשמה.</p>
    </div>
  );
}
