import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { addDays, newId, nowIso } from "../lib/ids";

export type SubscriptionStatus = "trial" | "active" | "canceled" | "expired";

export interface Subscription {
  id: string;
  user_id: string;
  course_id: string;
  status: SubscriptionStatus;
  provider: string;
  provider_ref: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entitlement {
  hasAccess: boolean;
  reason: "staff" | "trial" | "active" | "canceled_until_period_end" | "none" | "expired";
  subscription: Subscription | null;
  endsAt: string | null;
}

/** Access end for a subscription row, or null if it has no time bound. */
function accessEnd(sub: Subscription): string | null {
  if (sub.status === "trial") return sub.trial_ends_at;
  return sub.current_period_end;
}

/**
 * All entitlement decisions happen here, on the server. UI code only renders
 * what this returns; it never decides access on its own.
 */
export class EntitlementService {
  constructor(private readonly db: SqlDb) {}

  async latestSubscription(userId: string, courseId: string): Promise<Subscription | null> {
    return this.db.get<Subscription>(
      "SELECT * FROM subscriptions WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      [userId, courseId],
    );
  }

  async getEntitlement(user: User | null, courseId: string, now = new Date()): Promise<Entitlement> {
    if (!user) return { hasAccess: false, reason: "none", subscription: null, endsAt: null };
    if (user.role === "admin" || user.role === "reviewer") {
      return { hasAccess: true, reason: "staff", subscription: null, endsAt: null };
    }
    const sub = await this.latestSubscription(user.id, courseId);
    if (!sub) return { hasAccess: false, reason: "none", subscription: null, endsAt: null };
    const end = accessEnd(sub);
    const stillValid = end ? new Date(end).getTime() > now.getTime() : sub.status === "active";
    if (!stillValid) {
      if (sub.status !== "expired") {
        await this.db.run("UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE id = ?", [nowIso(), sub.id]);
        sub.status = "expired";
      }
      return { hasAccess: false, reason: "expired", subscription: sub, endsAt: end };
    }
    if (sub.status === "trial") return { hasAccess: true, reason: "trial", subscription: sub, endsAt: end };
    if (sub.status === "active") return { hasAccess: true, reason: "active", subscription: sub, endsAt: end };
    if (sub.status === "canceled") return { hasAccess: true, reason: "canceled_until_period_end", subscription: sub, endsAt: end };
    return { hasAccess: false, reason: "expired", subscription: sub, endsAt: end };
  }

  /** One free trial per user and course. */
  async startTrial(userId: string, courseId: string, trialDays: number): Promise<Subscription> {
    const previous = await this.db.get("SELECT id FROM subscriptions WHERE user_id = ? AND course_id = ?", [userId, courseId]);
    if (previous) throw new Error("תקופת הניסיון כבר נוצלה עבור קורס זה");
    const id = newId("sub");
    await this.db.run(
      "INSERT INTO subscriptions (id, user_id, course_id, status, provider, trial_ends_at) VALUES (?,?,?,'trial','trial',?)",
      [id, userId, courseId, addDays(new Date(), trialDays).toISOString()],
    );
    return (await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [id]))!;
  }

  /**
   * Activation recorded by an admin, e.g. after an invoice was paid by bank
   * transfer. This is a real business operation, not a simulated payment.
   */
  async grantManual(userId: string, courseId: string, until: Date, note: string, adminId: string): Promise<Subscription> {
    const id = newId("sub");
    await this.db.run(
      "INSERT INTO subscriptions (id, user_id, course_id, status, provider, current_period_end, note) VALUES (?,?,?,'active','manual',?,?)",
      [id, userId, courseId, until.toISOString(), note],
    );
    await this.audit(adminId, "subscription.grant_manual", id, { userId, courseId, until: until.toISOString(), note });
    return (await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [id]))!;
  }

  /** Records a period paid through a verified payment provider webhook. */
  async activateFromProvider(userId: string, courseId: string, provider: string, providerRef: string, periodEnd: Date): Promise<Subscription> {
    const existing = await this.db.get<Subscription>(
      "SELECT * FROM subscriptions WHERE provider = ? AND provider_ref = ?",
      [provider, providerRef],
    );
    if (existing) {
      await this.db.run(
        "UPDATE subscriptions SET status = 'active', current_period_end = ?, canceled_at = NULL, updated_at = ? WHERE id = ?",
        [periodEnd.toISOString(), nowIso(), existing.id],
      );
      return (await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [existing.id]))!;
    }
    const id = newId("sub");
    await this.db.run(
      "INSERT INTO subscriptions (id, user_id, course_id, status, provider, provider_ref, current_period_end) VALUES (?,?,?,'active',?,?,?)",
      [id, userId, courseId, provider, providerRef, periodEnd.toISOString()],
    );
    return (await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [id]))!;
  }

  /** Cancels renewal. Access continues until the paid period (or trial) ends. */
  async cancel(subscriptionId: string, actorId: string): Promise<void> {
    const sub = await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [subscriptionId]);
    if (!sub) throw new Error("מנוי לא נמצא");
    const end = sub.status === "trial" ? sub.trial_ends_at : sub.current_period_end;
    await this.db.run(
      "UPDATE subscriptions SET status = 'canceled', canceled_at = ?, current_period_end = ?, updated_at = ? WHERE id = ?",
      [nowIso(), end, nowIso(), subscriptionId],
    );
    await this.audit(actorId, "subscription.cancel", subscriptionId, {});
  }

  /** Immediate revocation by an admin (refund, abuse). */
  async revoke(subscriptionId: string, adminId: string, note: string): Promise<void> {
    await this.db.run(
      "UPDATE subscriptions SET status = 'expired', current_period_end = ?, note = ?, updated_at = ? WHERE id = ?",
      [nowIso(), note, nowIso(), subscriptionId],
    );
    await this.audit(adminId, "subscription.revoke", subscriptionId, { note });
  }

  async listForCourse(courseId: string) {
    return this.db.all<Subscription & { email: string; full_name: string }>(
      `SELECT s.*, u.email, u.full_name FROM subscriptions s JOIN users u ON u.id = s.user_id
       WHERE s.course_id = ? ORDER BY s.created_at DESC`,
      [courseId],
    );
  }

  private async audit(actorId: string, action: string, targetId: string, details: unknown) {
    await this.db.run(
      "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)",
      [newId("aud"), actorId, action, "subscription", targetId, JSON.stringify(details)],
    );
  }
}

export interface LessonAccessInput {
  access: "free" | "paid";
  status: "draft" | "review" | "published";
}

/** Pure decision used by pages and API routes alike. */
export function decideLessonAccess(
  user: User | null,
  lesson: LessonAccessInput,
  entitlement: Entitlement,
): { allowed: boolean; reason: "staff" | "free" | "entitled" | "login_required" | "subscription_required" | "not_published" } {
  const staff = !!user && (user.role === "admin" || user.role === "reviewer");
  if (staff) return { allowed: true, reason: "staff" };
  if (lesson.status !== "published") return { allowed: false, reason: "not_published" };
  if (!user) return { allowed: false, reason: "login_required" };
  if (lesson.access === "free") return { allowed: true, reason: "free" };
  if (entitlement.hasAccess) return { allowed: true, reason: "entitled" };
  return { allowed: false, reason: "subscription_required" };
}
