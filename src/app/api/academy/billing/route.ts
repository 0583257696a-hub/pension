import { requireApiUser } from "@/academy/auth/session";
import { EntitlementService } from "@/academy/billing/entitlements";
import { getPaymentProvider } from "@/academy/billing/payment-provider";
import { getConfig } from "@/academy/config";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { LearningService } from "@/academy/services/learning";

/** Student billing actions: start the free trial, open checkout, cancel renewal. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await readJson<{ action?: "trial" | "checkout" | "cancel" }>(request);
    const db = await getDb();
    const course = await new LearningService(db).getCourse();
    if (!course) return json({ error: "הקורס לא נמצא" }, 404);
    const entitlements = new EntitlementService(db);
    switch (body.action) {
      case "trial": {
        const sub = await entitlements.startTrial(user.id, course.id, course.trial_days);
        return json({ ok: true, subscription: sub });
      }
      case "checkout": {
        const provider = getPaymentProvider(getConfig().payments.provider);
        const { redirectUrl } = await provider.createCheckout({
          userId: user.id, email: user.email, fullName: user.full_name, courseId: course.id, courseTitle: course.title, priceIls: course.price_ils,
          successUrl: `${getConfig().appUrl}/academy/account?paid=1`, cancelUrl: `${getConfig().appUrl}/academy/account`,
        });
        return json({ ok: true, redirectUrl });
      }
      case "cancel": {
        const sub = await entitlements.latestSubscription(user.id, course.id);
        if (!sub || sub.user_id !== user.id) return json({ error: "אין מנוי פעיל" }, 404);
        await entitlements.cancel(sub.id, user.id);
        return json({ ok: true });
      }
      default:
        return json({ error: "פעולה לא מוכרת" }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
