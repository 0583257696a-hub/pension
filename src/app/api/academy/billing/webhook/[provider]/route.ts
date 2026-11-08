import { EntitlementService } from "@/academy/billing/entitlements";
import { getPaymentProvider } from "@/academy/billing/payment-provider";
import { getDb } from "@/academy/db";
import { errorResponse, json } from "@/academy/http";

/** Payment provider webhooks. The provider verifies the signature before any event is trusted. */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: name } = await params;
    const provider = getPaymentProvider(name);
    if (!provider.available || provider.name !== name) return json({ error: "unknown provider" }, 404);
    const event = await provider.parseWebhook(request);
    const entitlements = new EntitlementService(await getDb());
    if (event.type === "subscription.activated" || event.type === "subscription.renewed") {
      await entitlements.activateFromProvider(event.userId, event.courseId, provider.name, event.providerRef, event.periodEnd);
    }
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
