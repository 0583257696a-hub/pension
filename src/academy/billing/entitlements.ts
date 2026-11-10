import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { newId, nowIso } from "../lib/ids";

export type EntitlementSource = "purchase" | "subscription" | "admin" | "coupon" | "legacy";

export interface EntitlementRow {
  id: string;
  user_id: string;
  course_id: string;
  source: EntitlementSource;
  order_id: string | null;
  subscription_id: string | null;
  starts_at: string;
  expires_at: string | null;
  status: "active" | "revoked";
  note: string | null;
  granted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  course_id: string;
  status: "trial" | "active" | "canceled" | "expired";
  provider: string;
  provider_ref: string | null;
  plan_id: string | null;
  order_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entitlement {
  hasAccess: boolean;
  reason: "staff" | "active" | "none" | "expired";
  /** The entitlement that grants access (the one ending last), if any. */
  entitlement: EntitlementRow | null;
  /** Null when access does not expire. */
  endsAt: string | null;
  /** Recurring subscription that renews this access, if any. */
  subscription: Subscription | null;
}

/**
 * All access decisions happen here, on the server, from the `entitlements`
 * table. An entitlement is created only by a verified payment webhook, a 100%
 * coupon, or an admin. UI code renders what this returns; it never decides.
 */
export class EntitlementService {
  constructor(private readonly db: SqlDb) {}

  async activeEntitlements(userId: string, courseId: string, now = new Date()): Promise<EntitlementRow[]> {
    const iso = now.toISOString();
    return this.db.all<EntitlementRow>(
      `SELECT * FROM entitlements WHERE user_id = ? AND course_id = ? AND status = 'active' AND starts_at <= ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END DESC, expires_at DESC`,
      [userId, courseId, iso, iso],
    );
  }

  async latestSubscription(userId: string, courseId: string): Promise<Subscription | null> {
    return this.db.get<Subscription>(
      "SELECT * FROM subscriptions WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      [userId, courseId],
    );
  }

  async getEntitlement(user: User | null, courseId: string, now = new Date()): Promise<Entitlement> {
    if (!user) return { hasAccess: false, reason: "none", entitlement: null, endsAt: null, subscription: null };
    if (user.role === "admin" || user.role === "reviewer") {
      return { hasAccess: true, reason: "staff", entitlement: null, endsAt: null, subscription: null };
    }
    const subscription = await this.latestSubscription(user.id, courseId);
    const active = await this.activeEntitlements(user.id, courseId, now);
    if (active.length) {
      return { hasAccess: true, reason: "active", entitlement: active[0], endsAt: active[0].expires_at, subscription };
    }
    const any = await this.db.get<EntitlementRow>(
      "SELECT * FROM entitlements WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC LIMIT 1",
      [user.id, courseId],
    );
    return { hasAccess: false, reason: any ? "expired" : "none", entitlement: any, endsAt: any?.expires_at ?? null, subscription };
  }

  async grant(input: {
    userId: string; courseId: string; source: EntitlementSource; expiresAt: Date | null; note?: string;
    orderId?: string | null; subscriptionId?: string | null; grantedBy?: string | null;
  }): Promise<EntitlementRow> {
    const id = newId("ent");
    await this.db.run(
      `INSERT INTO entitlements (id, user_id, course_id, source, order_id, subscription_id, expires_at, note, granted_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id, input.userId, input.courseId, input.source, input.orderId ?? null, input.subscriptionId ?? null,
        input.expiresAt ? input.expiresAt.toISOString() : null, input.note ?? null, input.grantedBy ?? null,
      ],
    );
    await this.audit(input.grantedBy ?? null, `entitlement.grant.${input.source}`, id, {
      userId: input.userId, courseId: input.courseId, expiresAt: input.expiresAt?.toISOString() ?? null, orderId: input.orderId ?? null,
    });
    return (await this.db.get<EntitlementRow>("SELECT * FROM entitlements WHERE id = ?", [id]))!;
  }

  /** Access granted by an admin (e.g. invoice paid by bank transfer, scholarship). A real business operation, not a simulated payment. */
  async grantManual(userId: string, courseId: string, until: Date | null, note: string, adminId: string): Promise<EntitlementRow> {
    if (!note.trim()) throw new Error("יש לציין סיבה או אסמכתה להענקת הגישה");
    return this.grant({ userId, courseId, source: "admin", expiresAt: until, note, grantedBy: adminId });
  }

  /** Extends (or creates) the entitlement attached to a recurring subscription. */
  async extendForSubscription(subscription: Subscription, until: Date): Promise<void> {
    const existing = await this.db.get<EntitlementRow>("SELECT * FROM entitlements WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 1", [subscription.id]);
    if (existing) {
      await this.db.run("UPDATE entitlements SET expires_at = ?, status = 'active', updated_at = ? WHERE id = ?", [until.toISOString(), nowIso(), existing.id]);
      return;
    }
    await this.grant({
      userId: subscription.user_id, courseId: subscription.course_id, source: "subscription", expiresAt: until,
      subscriptionId: subscription.id, orderId: subscription.order_id,
    });
  }

  /** Immediate revocation (refund, abuse). */
  async revoke(entitlementId: string, actorId: string | null, note: string): Promise<void> {
    await this.db.run("UPDATE entitlements SET status = 'revoked', note = ?, updated_at = ? WHERE id = ?", [note, nowIso(), entitlementId]);
    await this.audit(actorId, "entitlement.revoke", entitlementId, { note });
  }

  /** Stops renewal. Access continues until the paid period ends. */
  async cancelSubscription(subscriptionId: string, actorId: string): Promise<void> {
    const sub = await this.db.get<Subscription>("SELECT * FROM subscriptions WHERE id = ?", [subscriptionId]);
    if (!sub) throw new Error("מנוי לא נמצא");
    await this.db.run("UPDATE subscriptions SET status = 'canceled', canceled_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), subscriptionId]);
    await this.audit(actorId, "subscription.cancel", subscriptionId, {});
  }

  async listForCourse(courseId: string) {
    return this.db.all<EntitlementRow & { email: string; full_name: string }>(
      `SELECT e.*, u.email, u.full_name FROM entitlements e JOIN users u ON u.id = e.user_id
       WHERE e.course_id = ? ORDER BY e.created_at DESC`,
      [courseId],
    );
  }

  async listForUser(userId: string) {
    return this.db.all<EntitlementRow & { course_title: string }>(
      `SELECT e.*, c.title AS course_title FROM entitlements e JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = ? ORDER BY e.created_at DESC`,
      [userId],
    );
  }

  private async audit(actorId: string | null, action: string, targetId: string, details: unknown) {
    await this.db.run(
      "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)",
      [newId("aud"), actorId, action, "entitlement", targetId, JSON.stringify(details)],
    );
  }
}

export interface LessonAccessInput {
  access: "free" | "paid";
  status: "draft" | "review" | "published";
}

/** Pure decision used by pages and API routes alike. "free" lessons are previews for signed-in users. */
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
