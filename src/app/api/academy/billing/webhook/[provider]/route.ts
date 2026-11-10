import { BillingService } from "@/academy/billing/service";
import { getPaymentProvider } from "@/academy/billing/payment-provider";
import { getDb } from "@/academy/db";
import { errorResponse, json } from "@/academy/http";

/**
 * Payment provider webhooks. The provider verifies the signature inside
 * `parseWebhook` before any event is trusted; each event id is applied once.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: name } = await params;
    const provider = getPaymentProvider(name);
    if (!provider.available || provider.name !== name) return json({ error: "unknown provider" }, 404);
    const event = await provider.parseWebhook(request);
    const result = await new BillingService(await getDb(), name).handleEvent(name, event);
    // A failed event is stored for review; the provider gets 200 so it does not retry a permanent failure.
    return json({ ok: result.status !== "failed", duplicate: result.duplicate, status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
