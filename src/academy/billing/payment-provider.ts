/**
 * Payment provider abstraction.
 *
 * The academy does not ship a simulated payment flow. Until a real, verified
 * payment service provider (PSP) is integrated, the "none" provider is active:
 * checkout is unavailable, and an admin can record a paid period manually
 * (e.g. invoice + bank transfer) from the admin panel.
 *
 * To integrate a PSP, implement this interface (hosted payment page + signed
 * webhook verification), register it in `getPaymentProvider`, and set
 * ACADEMY_PAYMENT_PROVIDER. Card data must never touch this server.
 */
export interface CheckoutRequest {
  userId: string;
  email: string;
  fullName: string;
  courseId: string;
  courseTitle: string;
  priceIls: number;
  successUrl: string;
  cancelUrl: string;
}

export type PaymentEvent =
  | { type: "subscription.activated"; userId: string; courseId: string; providerRef: string; periodEnd: Date }
  | { type: "subscription.renewed"; userId: string; courseId: string; providerRef: string; periodEnd: Date }
  | { type: "subscription.canceled"; providerRef: string }
  | { type: "ignored" };

export interface PaymentProvider {
  readonly name: string;
  readonly available: boolean;
  createCheckout(request: CheckoutRequest): Promise<{ redirectUrl: string }>;
  /** Must verify the webhook signature before returning any event. */
  parseWebhook(request: Request): Promise<PaymentEvent>;
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("סליקה מקוונת עדיין לא הופעלה. ניתן להפעיל מנוי באמצעות פנייה לצוות האקדמיה.");
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

export function getPaymentProvider(name: string): PaymentProvider {
  switch (name) {
    // case "cardcom": return new CardcomProvider(...)   <- add a verified PSP here
    default:
      return new NoPaymentProvider();
  }
}
