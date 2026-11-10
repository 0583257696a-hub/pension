import { requireApiUser } from "@/academy/auth/session";
import { BillingService } from "@/academy/billing/service";
import { getConfig } from "@/academy/config";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";

/** Student billing: price quote (with coupon), checkout on the provider's hosted page, cancel renewal. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await readJson<{ action?: "quote" | "checkout" | "cancel"; planId?: string; coupon?: string; subscriptionId?: string }>(request);
    const config = getConfig();
    const billing = new BillingService(await getDb(), config.payments.provider);
    switch (body.action) {
      case "quote": {
        const q = await billing.quote(String(body.planId ?? ""), body.coupon ?? null);
        return json({ ok: true, listPrice: q.listPrice, discount: q.discount, amount: q.amount, coupon: q.coupon?.code ?? null });
      }
      case "checkout": {
        const result = await billing.checkout(user, String(body.planId ?? ""), body.coupon ?? null, { appUrl: config.appUrl });
        return json({ ok: true, ...result });
      }
      case "cancel":
        await billing.cancelSubscription(user, String(body.subscriptionId ?? ""));
        return json({ ok: true });
      default:
        return json({ error: "פעולה לא מוכרת" }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
