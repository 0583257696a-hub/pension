import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EntitlementService } from "../billing/entitlements";
import { registerPaymentProvider, type CheckoutRequest, type PaymentEvent, type PaymentProvider } from "../billing/payment-provider";
import { BillingService } from "../billing/service";
import { COURSE_ID } from "../content/course";
import { freshDb, makeUser } from "./helpers";

/**
 * Test double for a PSP: a hosted page URL and HMAC-signed webhooks. It lives
 * only in the test suite; production registers no provider until a real PSP
 * is integrated.
 */
class SignedTestProvider implements PaymentProvider {
  readonly name = "testpsp";
  readonly available = true;
  readonly secret = "whsec_test";
  checkouts: CheckoutRequest[] = [];
  status = new Map<string, "paid" | "pending" | "failed">();
  async createCheckout(request: CheckoutRequest) {
    this.checkouts.push(request);
    return { redirectUrl: `https://pay.example.test/hosted/${request.orderId}`, providerRef: `ref_${request.orderId}` };
  }
  sign(body: string) {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }
  async parseWebhook(request: Request): Promise<PaymentEvent> {
    const body = await request.text();
    if (request.headers.get("x-signature") !== this.sign(body)) throw new Error("invalid signature");
    const e = JSON.parse(body);
    if (e.periodEnd) e.periodEnd = new Date(e.periodEnd);
    return e as PaymentEvent;
  }
  async fetchOrderStatus(orderId: string) {
    return this.status.get(orderId) ?? "unknown";
  }
}

const provider = new SignedTestProvider();
registerPaymentProvider(provider);

async function setup() {
  const db = await freshDb();
  const admin = await makeUser(db, "admin@example.com");
  const student = await makeUser(db, "buyer@example.com");
  const billing = new BillingService(db, provider.name);
  await db.run("UPDATE plans SET active = 1");
  return { db, admin, student, billing, entitlements: new EntitlementService(db) };
}

const webhook = (event: object) => {
  const body = JSON.stringify(event);
  return new Request("https://academy.test/api/academy/billing/webhook/testpsp", { method: "POST", body, headers: { "x-signature": provider.sign(body) } });
};

describe("billing: purchase only through verified webhooks", () => {
  it("one-time purchase: access opens after the signed webhook, once, for the paid amount only", async () => {
    const { db, student, billing, entitlements } = await setup();
    const res = await billing.checkout(student, "plan_fs_once", null, { appUrl: "https://academy.test" });
    expect(res.granted).toBe(false);
    expect(res.redirectUrl).toContain("pay.example.test");
    expect(provider.checkouts.at(-1)).toMatchObject({ amountAgorot: 59000, currency: "ILS", webhookUrl: "https://academy.test/api/academy/billing/webhook/testpsp" });
    // Reaching the success page grants nothing.
    expect((await entitlements.getEntitlement(student, COURSE_ID)).hasAccess).toBe(false);

    await expect(provider.parseWebhook(new Request("https://x", { method: "POST", body: "{}", headers: { "x-signature": "bad" } }))).rejects.toThrow();

    const wrongAmount = await provider.parseWebhook(webhook({ type: "order.paid", eventId: "ev_1", orderId: res.orderId, providerRef: "ch_1", amountAgorot: 100, currency: "ILS" }));
    expect((await billing.handleEvent("testpsp", wrongAmount)).status).toBe("failed");
    expect((await entitlements.getEntitlement(student, COURSE_ID)).hasAccess).toBe(false);

    const paid = await provider.parseWebhook(webhook({ type: "order.paid", eventId: "ev_2", orderId: res.orderId, providerRef: "ch_2", amountAgorot: 59000, currency: "ILS" }));
    expect(await billing.handleEvent("testpsp", paid)).toEqual({ duplicate: false, status: "processed" });
    expect(await billing.handleEvent("testpsp", paid)).toEqual({ duplicate: true, status: "ignored" });
    const again = await provider.parseWebhook(webhook({ type: "order.paid", eventId: "ev_3", orderId: res.orderId, providerRef: "ch_2", amountAgorot: 59000, currency: "ILS" }));
    expect((await billing.handleEvent("testpsp", again)).status).toBe("ignored");

    const ent = await entitlements.getEntitlement(student, COURSE_ID);
    expect(ent.hasAccess).toBe(true);
    expect(ent.entitlement?.source).toBe("purchase");
    const days = (new Date(ent.endsAt!).getTime() - Date.now()) / 86400_000;
    expect(Math.round(days)).toBe(183);
    expect(Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM entitlements WHERE user_id = ?", [student.id]))?.n)).toBe(1);

    // Refund revokes the access.
    const refund = await provider.parseWebhook(webhook({ type: "order.refunded", eventId: "ev_4", orderId: res.orderId }));
    await billing.handleEvent("testpsp", refund);
    expect((await entitlements.getEntitlement(student, COURSE_ID)).hasAccess).toBe(false);
  });

  it("monthly subscription: renewal extends access, cancel keeps it until period end, reconcile expires it", async () => {
    const { student, billing, entitlements } = await setup();
    const res = await billing.checkout(student, "plan_fs_monthly", null, { appUrl: "https://academy.test" });
    await billing.handleEvent("testpsp", { type: "order.paid", eventId: "ev_m1", orderId: res.orderId, providerRef: "ch_m1", amountAgorot: 14900, currency: "ILS", subscriptionRef: "sub_ext_1" });
    const first = await entitlements.getEntitlement(student, COURSE_ID);
    expect(first.subscription?.status).toBe("active");
    const nextEnd = new Date(Date.now() + 61 * 86400_000);
    await billing.handleEvent("testpsp", { type: "subscription.renewed", eventId: "ev_m2", subscriptionRef: "sub_ext_1", amountAgorot: 14900, periodEnd: nextEnd });
    expect((await entitlements.getEntitlement(student, COURSE_ID)).endsAt).toBe(nextEnd.toISOString());
    await billing.cancelSubscription(student, first.subscription!.id);
    const canceled = await entitlements.getEntitlement(student, COURSE_ID);
    expect(canceled.hasAccess).toBe(true);
    expect(canceled.subscription?.status).toBe("canceled");
    const report = await billing.reconcile(new Date(nextEnd.getTime() + 1000));
    expect(report.expiredSubscriptions).toBe(1);
    expect((await entitlements.getEntitlement(student, COURSE_ID, new Date(nextEnd.getTime() + 1000))).hasAccess).toBe(false);
  });

  it("coupons: validated, discounted, and a 100% coupon grants without a payment", async () => {
    const { admin, student, billing, entitlements } = await setup();
    await billing.createCoupon(admin, { code: "half", kind: "percent", value: 50 });
    await billing.createCoupon(admin, { code: "FREE100", kind: "percent", value: 100, planId: "plan_fs_once", maxRedemptions: 1 });
    await expect(billing.createCoupon(admin, { code: "x", kind: "percent", value: 10 })).rejects.toThrow();
    expect((await billing.quote("plan_fs_once", "HALF")).amount).toBe(29500);
    await expect(billing.quote("plan_fs_once", "NOPE")).rejects.toThrow(/אינו תקף/);
    await expect(billing.quote("plan_fs_monthly", "FREE100")).rejects.toThrow(); // limited to one plan
    const res = await billing.checkout(student, "plan_fs_once", "FREE100", { appUrl: "https://academy.test" });
    expect(res.granted).toBe(true);
    expect((await entitlements.getEntitlement(student, COURSE_ID)).entitlement?.source).toBe("coupon");
    const other = await makeUser((billing as unknown as { db: never }).db, "second@example.com");
    await expect(billing.checkout(other, "plan_fs_once", "FREE100", { appUrl: "https://academy.test" })).rejects.toThrow(); // used up
  });

  it("reconciliation completes an order whose webhook was lost", async () => {
    const { db, student, billing, entitlements } = await setup();
    const res = await billing.checkout(student, "plan_fs_once", null, { appUrl: "https://academy.test" });
    await db.run("UPDATE orders SET created_at = ? WHERE id = ?", [new Date(Date.now() - 3600_000).toISOString(), res.orderId]);
    provider.status.set(res.orderId, "paid");
    const report = await billing.reconcile();
    expect(report).toMatchObject({ checked: 1, paid: 1 });
    expect((await entitlements.getEntitlement(student, COURSE_ID)).hasAccess).toBe(true);
  });

  it("without a configured provider, a paid checkout is refused (no simulated payments)", async () => {
    const { db, student } = await setup();
    const none = new BillingService(db, "none");
    await expect(none.checkout(student, "plan_fs_once", null, { appUrl: "https://academy.test" })).rejects.toThrow(/לא זמין/);
    expect(Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM orders"))?.n)).toBe(0);
  });
});
