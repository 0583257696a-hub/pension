/**
 * Payment provider abstraction.
 *
 * The academy has no simulated payment flow. Until a real payment service
 * provider (PSP) is integrated and configured, checkout reports that online
 * payment is unavailable; access can still be granted by an admin (e.g. after
 * an invoice was paid by bank transfer) or by a 100% coupon.
 *
 * To integrate a PSP (an Israeli acquirer/gateway is still to be chosen):
 *  1. implement this interface with the provider's hosted payment page, so card
 *     data never touches this server;
 *  2. verify the webhook signature inside `parseWebhook` before returning any
 *     event, and return a stable provider event id (used for idempotency);
 *  3. implement `fetchOrderStatus` for reconciliation;
 *  4. register it in `getPaymentProvider` and set ACADEMY_PAYMENT_PROVIDER.
 */
export interface CheckoutRequest {
  orderId: string;
  userId: string;
  email: string;
  fullName: string;
  courseId: string;
  courseTitle: string;
  plan: { id: string; kind: "one_time" | "monthly" | "annual"; title: string };
  amountAgorot: number;
  currency: "ILS";
  successUrl: string;
  cancelUrl: string;
  webhookUrl: string;
}

export type PaymentEvent =
  | { type: "order.paid"; eventId: string; orderId: string; providerRef: string; amountAgorot: number; currency: string; subscriptionRef?: string }
  | { type: "order.failed"; eventId: string; orderId: string }
  | { type: "order.refunded"; eventId: string; orderId: string }
  | { type: "subscription.renewed"; eventId: string; subscriptionRef: string; amountAgorot: number; periodEnd: Date }
  | { type: "subscription.canceled"; eventId: string; subscriptionRef: string }
  | { type: "ignored"; eventId: string };

export interface PaymentProvider {
  readonly name: string;
  readonly available: boolean;
  createCheckout(request: CheckoutRequest): Promise<{ redirectUrl: string; providerRef?: string }>;
  /** Must verify the webhook signature before returning any event. */
  parseWebhook(request: Request): Promise<PaymentEvent>;
  /** Server-to-server status check used by reconciliation. */
  fetchOrderStatus?(orderId: string, providerRef: string | null): Promise<"paid" | "pending" | "failed" | "unknown">;
  cancelSubscription?(subscriptionRef: string): Promise<void>;
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("תשלום מקוון עדיין לא זמין. לרכישה אפשר לפנות אלינו בטופס יצירת הקשר, ונפתח לכם גישה לאחר התשלום.");
  }
}

class NoPaymentProvider implements PaymentProvider {
  readonly name = "none";
  readonly available = false;
  async createCheckout(): Promise<{ redirectUrl: string }> {
    throw new PaymentsNotConfiguredError();
  }
  async parseWebhook(): Promise<PaymentEvent> {
    throw new PaymentsNotConfiguredError();
  }
}

const registry = new Map<string, PaymentProvider>();

/** Registers a provider implementation (a verified PSP, or a signed test double inside the test suite). */
export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.name, provider);
}

export function getPaymentProvider(name: string): PaymentProvider {
  return registry.get(name) ?? new NoPaymentProvider();
}
