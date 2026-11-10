import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { newId, nowIso } from "../lib/ids";
import { EntitlementService, type Subscription } from "./entitlements";
import { getPaymentProvider, PaymentsNotConfiguredError, type PaymentEvent, type PaymentProvider } from "./payment-provider";

export class BillingError extends Error {}

export interface PlanRow {
  id: string; course_id: string; kind: "one_time" | "monthly" | "annual"; title: string; price_agorot: number;
  access_days: number | null; active: number; position: number; created_at: string;
}
export interface CouponRow {
  code: string; kind: "percent" | "amount"; value: number; course_id: string | null; plan_id: string | null;
  valid_until: string | null; max_redemptions: number | null; redemptions: number; active: number; created_at: string;
}
export interface OrderRow {
  id: string; user_id: string; course_id: string; plan_id: string; coupon_code: string | null; list_price_agorot: number;
  amount_agorot: number; currency: string; status: "pending" | "paid" | "failed" | "canceled" | "refunded"; provider: string;
  provider_ref: string | null; created_at: string; paid_at: string | null; updated_at: string;
}

export function formatIls(agorot: number): string {
  const ils = agorot / 100;
  return `${ils.toLocaleString("he-IL", { minimumFractionDigits: Number.isInteger(ils) ? 0 : 2, maximumFractionDigits: 2 })} ₪`;
}

export const PLAN_KIND_LABEL: Record<PlanRow["kind"], string> = { one_time: "רכישה חד-פעמית", monthly: "מנוי חודשי", annual: "מנוי שנתי" };

function periodEnd(kind: "monthly" | "annual", from: Date): Date {
  const d = new Date(from);
  if (kind === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/**
 * Plans, coupons, orders and payment events.
 *
 * Access is granted only from a verified webhook (`handleEvent`), a coupon that
 * brings the price to zero, or an admin action. Every webhook event is stored
 * once in `payment_events`, so a repeated delivery never grants twice, and
 * the paid amount must equal the order amount.
 */
export class BillingService {
  private readonly entitlements: EntitlementService;
  constructor(private readonly db: SqlDb, private readonly providerName: string) {
    this.entitlements = new EntitlementService(db);
  }

  get provider(): PaymentProvider {
    return getPaymentProvider(this.providerName);
  }

  async plans(courseId: string, activeOnly = true): Promise<PlanRow[]> {
    return this.db.all<PlanRow>(
      `SELECT * FROM plans WHERE course_id = ? ${activeOnly ? "AND active = 1" : ""} ORDER BY position, price_agorot`,
      [courseId],
    );
  }

  async quote(planId: string, couponCode?: string | null, now = new Date()) {
    const plan = await this.db.get<PlanRow>("SELECT * FROM plans WHERE id = ?", [planId]);
    if (!plan || !plan.active) throw new BillingError("המסלול אינו זמין");
    let coupon: CouponRow | null = null;
    let discount = 0;
    const code = couponCode?.trim().toUpperCase();
    if (code) {
      coupon = await this.db.get<CouponRow>("SELECT * FROM coupons WHERE code = ?", [code]);
      const invalid =
        !coupon || !coupon.active ||
        (coupon.valid_until && new Date(coupon.valid_until).getTime() < now.getTime()) ||
        (coupon.max_redemptions !== null && coupon.redemptions >= coupon.max_redemptions) ||
        (coupon.course_id && coupon.course_id !== plan.course_id) ||
        (coupon.plan_id && coupon.plan_id !== plan.id);
      if (invalid) throw new BillingError("קוד הקופון אינו תקף");
      discount = coupon!.kind === "percent" ? Math.round((plan.price_agorot * Math.min(coupon!.value, 100)) / 100) : Math.min(coupon!.value, plan.price_agorot);
    }
    return { plan, coupon, listPrice: plan.price_agorot, discount, amount: plan.price_agorot - discount };
  }

  /** Starts a purchase. Returns a redirect to the provider's hosted payment page, or grants directly for a free (100% coupon) order. */
  async checkout(user: User, planId: string, couponCode: string | null, urls: { appUrl: string }) {
    const { plan, coupon, listPrice, amount } = await this.quote(planId, couponCode);
    const course = await this.db.get<{ id: string; title: string }>("SELECT id, title FROM courses WHERE id = ?", [plan.course_id]);
    if (!course) throw new BillingError("הקורס לא נמצא");
    if (amount > 0 && !this.provider.available) throw new PaymentsNotConfiguredError();
    const orderId = newId("ord");
    await this.db.run(
      `INSERT INTO orders (id, user_id, course_id, plan_id, coupon_code, list_price_agorot, amount_agorot, provider)
       VALUES (?,?,?,?,?,?,?,?)`,
      [orderId, user.id, course.id, plan.id, coupon?.code ?? null, listPrice, amount, amount > 0 ? this.provider.name : "coupon"],
    );
    if (amount === 0) {
      if (plan.kind !== "one_time") throw new BillingError("קופון של 100% תקף רק לרכישה חד-פעמית");
      await this.markPaid((await this.order(orderId))!, `coupon:${coupon?.code}`, null);
      return { granted: true as const, orderId };
    }
    const { redirectUrl, providerRef } = await this.provider.createCheckout({
      orderId, userId: user.id, email: user.email, fullName: user.full_name, courseId: course.id, courseTitle: course.title,
      plan: { id: plan.id, kind: plan.kind, title: plan.title }, amountAgorot: amount, currency: "ILS",
      successUrl: `${urls.appUrl}/academy/account?order=${orderId}`,
      cancelUrl: `${urls.appUrl}/academy/pricing?canceled=1`,
      webhookUrl: `${urls.appUrl}/api/academy/billing/webhook/${this.provider.name}`,
    });
    if (providerRef) await this.db.run("UPDATE orders SET provider_ref = ? WHERE id = ?", [providerRef, orderId]);
    return { granted: false as const, orderId, redirectUrl };
  }

  async order(orderId: string): Promise<OrderRow | null> {
    return this.db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  }

  /** Applies a verified provider event exactly once. */
  async handleEvent(providerName: string, event: PaymentEvent): Promise<{ duplicate: boolean; status: "processed" | "ignored" | "failed"; error?: string }> {
    const orderId = "orderId" in event ? event.orderId : null;
    const inserted = await this.db.run(
      "INSERT OR IGNORE INTO payment_events (provider, event_id, type, order_id, status) VALUES (?,?,?,?,'processed')",
      [providerName, event.eventId, event.type, orderId],
    );
    if (!inserted.changes) return { duplicate: true, status: "ignored" };
    try {
      const status = await this.apply(providerName, event);
      if (status === "ignored") await this.db.run("UPDATE payment_events SET status = 'ignored' WHERE provider = ? AND event_id = ?", [providerName, event.eventId]);
      return { duplicate: false, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db.run("UPDATE payment_events SET status = 'failed', error = ? WHERE provider = ? AND event_id = ?", [message, providerName, event.eventId]);
      return { duplicate: false, status: "failed", error: message };
    }
  }

  private async apply(providerName: string, event: PaymentEvent): Promise<"processed" | "ignored"> {
    switch (event.type) {
      case "order.paid": {
        const order = await this.order(event.orderId);
        if (!order || order.provider !== providerName) throw new BillingError("הזמנה לא נמצאה");
        if (order.status === "paid") return "ignored";
        if (event.amountAgorot !== order.amount_agorot || event.currency !== order.currency) {
          throw new BillingError(`הסכום ששולם (${event.amountAgorot}) אינו תואם להזמנה (${order.amount_agorot})`);
        }
        await this.markPaid(order, event.providerRef, event.subscriptionRef ?? null);
        return "processed";
      }
      case "order.failed": {
        await this.db.run("UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'pending'", [nowIso(), event.orderId]);
        return "processed";
      }
      case "order.refunded": {
        await this.db.run("UPDATE orders SET status = 'refunded', updated_at = ? WHERE id = ?", [nowIso(), event.orderId]);
        const ents = await this.db.all<{ id: string }>("SELECT id FROM entitlements WHERE order_id = ? AND status = 'active'", [event.orderId]);
        for (const e of ents) await this.entitlements.revoke(e.id, null, "החזר כספי");
        await this.db.run("UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE order_id = ?", [nowIso(), event.orderId]);
        return "processed";
      }
      case "subscription.renewed": {
        const sub = await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE provider = ? AND provider_ref = ?", [providerName, event.subscriptionRef]);
        if (!sub) throw new BillingError("מנוי לא נמצא");
        const plan = sub.plan_id ? await this.db.get<PlanRow>("SELECT * FROM plans WHERE id = ?", [sub.plan_id]) : null;
        if (plan && event.amountAgorot <= 0) throw new BillingError("סכום חידוש לא תקין");
        await this.db.run("UPDATE subscriptions SET status = 'active', current_period_end = ?, canceled_at = NULL, updated_at = ? WHERE id = ?", [
          event.periodEnd.toISOString(), nowIso(), sub.id,
        ]);
        await this.entitlements.extendForSubscription(sub, event.periodEnd);
        return "processed";
      }
      case "subscription.canceled": {
        const sub = await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE provider = ? AND provider_ref = ?", [providerName, event.subscriptionRef]);
        if (!sub) return "ignored";
        await this.db.run("UPDATE subscriptions SET status = 'canceled', canceled_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), sub.id]);
        return "processed";
      }
      default:
        return "ignored";
    }
  }

  private async markPaid(order: OrderRow, providerRef: string, subscriptionRef: string | null) {
    const plan = (await this.db.get<PlanRow>("SELECT * FROM plans WHERE id = ?", [order.plan_id]))!;
    const now = new Date();
    const updated = await this.db.run(
      "UPDATE orders SET status = 'paid', provider_ref = COALESCE(provider_ref, ?), paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
      [providerRef, now.toISOString(), now.toISOString(), order.id],
    );
    if (!updated.changes) return;
    if (order.coupon_code) await this.db.run("UPDATE coupons SET redemptions = redemptions + 1 WHERE code = ?", [order.coupon_code]);
    if (plan.kind === "one_time") {
      const expires = plan.access_days ? new Date(now.getTime() + plan.access_days * 86400_000) : null;
      await this.entitlements.grant({ userId: order.user_id, courseId: order.course_id, source: order.provider === "coupon" ? "coupon" : "purchase", expiresAt: expires, orderId: order.id });
      return;
    }
    const subId = newId("sub");
    const end = periodEnd(plan.kind, now);
    await this.db.run(
      `INSERT INTO subscriptions (id, user_id, course_id, status, provider, provider_ref, current_period_end, plan_id, order_id)
       VALUES (?,?,?,'active',?,?,?,?,?)`,
      [subId, order.user_id, order.course_id, order.provider, subscriptionRef ?? providerRef, end.toISOString(), plan.id, order.id],
    );
    const sub = (await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [subId]))!;
    await this.entitlements.extendForSubscription(sub, end);
  }

  /** Student cancels renewal; access stays until the end of the paid period. */
  async cancelSubscription(user: User, subscriptionId: string) {
    const sub = await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [subscriptionId]);
    if (!sub || sub.user_id !== user.id) throw new BillingError("מנוי לא נמצא");
    if (sub.provider_ref && this.provider.name === sub.provider && this.provider.cancelSubscription) {
      await this.provider.cancelSubscription(sub.provider_ref);
    }
    await this.entitlements.cancelSubscription(sub.id, user.id);
  }

  /**
   * Reconciliation: asks the provider about orders still pending after 15
   * minutes (a lost webhook), and expires subscriptions whose period ended.
   */
  async reconcile(now = new Date()) {
    const report = { checked: 0, paid: 0, failed: 0, expiredSubscriptions: 0 };
    const cutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
    const pending = await this.db.all<OrderRow>("SELECT * FROM orders WHERE status = 'pending' AND created_at < ? AND provider = ?", [cutoff, this.provider.name]);
    for (const order of pending) {
      if (!this.provider.fetchOrderStatus) break;
      report.checked++;
      const status = await this.provider.fetchOrderStatus(order.id, order.provider_ref);
      if (status === "paid") {
        await this.markPaid(order, order.provider_ref ?? `reconciled:${order.id}`, null);
        report.paid++;
      } else if (status === "failed") {
        await this.db.run("UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?", [now.toISOString(), order.id]);
        report.failed++;
      }
    }
    const expired = await this.db.run(
      "UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE status IN ('active','canceled') AND current_period_end IS NOT NULL AND current_period_end < ?",
      [now.toISOString(), now.toISOString()],
    );
    report.expiredSubscriptions = expired.changes;
    return report;
  }

  // ---------------------------------------------------------------- admin

  async updatePlan(admin: User, planId: string, input: { title?: string; priceAgorot?: number; accessDays?: number | null; active?: boolean }) {
    const plan = await this.db.get<PlanRow>("SELECT * FROM plans WHERE id = ?", [planId]);
    if (!plan) throw new BillingError("מסלול לא נמצא");
    const price = input.priceAgorot ?? plan.price_agorot;
    if (!Number.isInteger(price) || price < 0) throw new BillingError("מחיר לא תקין");
    await this.db.run("UPDATE plans SET title = ?, price_agorot = ?, access_days = ?, active = ? WHERE id = ?", [
      input.title?.trim() || plan.title, price, input.accessDays === undefined ? plan.access_days : input.accessDays,
      input.active === undefined ? plan.active : input.active ? 1 : 0, planId,
    ]);
    await this.audit(admin.id, "plan.update", planId, input);
  }

  async createCoupon(admin: User, input: { code: string; kind: "percent" | "amount"; value: number; planId?: string | null; courseId?: string | null; validUntil?: string | null; maxRedemptions?: number | null }) {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new BillingError("קוד קופון: 3–32 תווים באנגלית, ספרות, מקף או קו תחתון");
    if (!Number.isInteger(input.value) || input.value <= 0 || (input.kind === "percent" && input.value > 100)) throw new BillingError("ערך הנחה לא תקין");
    await this.db.run(
      `INSERT INTO coupons (code, kind, value, course_id, plan_id, valid_until, max_redemptions, created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [code, input.kind, input.value, input.courseId ?? null, input.planId ?? null, input.validUntil ?? null, input.maxRedemptions ?? null, admin.id],
    );
    await this.audit(admin.id, "coupon.create", code, input);
  }

  async setCouponActive(admin: User, code: string, active: boolean) {
    await this.db.run("UPDATE coupons SET active = ? WHERE code = ?", [active ? 1 : 0, code]);
    await this.audit(admin.id, "coupon.active", code, { active });
  }

  async coupons() {
    return this.db.all<CouponRow>("SELECT * FROM coupons ORDER BY created_at DESC");
  }

  async orders(limit = 100) {
    return this.db.all<OrderRow & { email: string; plan_title: string }>(
      `SELECT o.*, u.email, p.title AS plan_title FROM orders o JOIN users u ON u.id = o.user_id JOIN plans p ON p.id = o.plan_id
       ORDER BY o.created_at DESC LIMIT ?`,
      [limit],
    );
  }

  async ordersForUser(userId: string) {
    return this.db.all<OrderRow & { plan_title: string }>(
      "SELECT o.*, p.title AS plan_title FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.user_id = ? ORDER BY o.created_at DESC",
      [userId],
    );
  }

  async paymentEvents(limit = 50) {
    return this.db.all<{ provider: string; event_id: string; type: string; order_id: string | null; status: string; error: string | null; received_at: string }>(
      "SELECT * FROM payment_events ORDER BY received_at DESC LIMIT ?",
      [limit],
    );
  }

  private async audit(actorId: string, action: string, targetId: string, details: unknown) {
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), actorId, action, "billing", targetId, JSON.stringify(details),
    ]);
  }
}
