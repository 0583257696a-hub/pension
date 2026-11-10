import { describe, expect, it } from "vitest";
import { AuthService } from "../auth/service";
import { hashPassword, verifyPassword } from "../auth/password";
import { decideLessonAccess, EntitlementService } from "../billing/entitlements";
import { getPaymentProvider, PaymentsNotConfiguredError } from "../billing/payment-provider";
import { COURSE_ID } from "../content/course";
import { freshDb, makeUser } from "./helpers";

describe("passwords", () => {
  it("hashes with a per-user salt and verifies", async () => {
    const a = await hashPassword("Secret123");
    const b = await hashPassword("Secret123");
    expect(a).not.toBe(b);
    expect(await verifyPassword("Secret123", a)).toBe(true);
    expect(await verifyPassword("secret123", a)).toBe(false);
    expect(a).not.toContain("Secret123");
    // Iteration counts above the Workers PBKDF2 cap are refused.
    expect(await verifyPassword("Secret123", a.replace("pbkdf2$100000$", "pbkdf2$900000$"))).toBe(false);
  });
});

describe("auth service", () => {
  it("makes the first user admin and later users students", async () => {
    const db = await freshDb(false);
    const auth = new AuthService(db);
    const first = await auth.register({ email: "Owner@Example.com", password: "Passw0rd!", full_name: "Owner" });
    const second = await auth.register({ email: "student@example.com", password: "Passw0rd!", full_name: "S" });
    expect(first.user.role).toBe("admin");
    expect(first.user.email).toBe("owner@example.com");
    expect(second.user.role).toBe("student");
  });

  it("rejects duplicates, weak passwords and wrong credentials", async () => {
    const db = await freshDb(false);
    const auth = new AuthService(db);
    await auth.register({ email: "a@example.com", password: "Passw0rd!", full_name: "A" });
    await expect(auth.register({ email: "a@example.com", password: "Passw0rd!", full_name: "A" })).rejects.toThrow();
    await expect(auth.register({ email: "b@example.com", password: "short", full_name: "B" })).rejects.toThrow();
    await expect(auth.login("a@example.com", "wrong-pass1")).rejects.toThrow();
  });

  it("stores only token hashes, expires and revokes sessions", async () => {
    const db = await freshDb(false);
    const auth = new AuthService(db, 30);
    const { token, user } = await auth.register({ email: "a@example.com", password: "Passw0rd!", full_name: "A" });
    expect(await db.get("SELECT id FROM sessions WHERE id = ?", [token])).toBeNull();
    expect((await auth.getUserBySessionToken(token))?.id).toBe(user.id);
    await auth.setStatus(user.id, "blocked");
    expect(await auth.getUserBySessionToken(token)).toBeNull();
    await auth.setStatus(user.id, "active");
    await expect(auth.login("a@example.com", "Passw0rd!")).resolves.toBeTruthy();
    const login = await auth.login("a@example.com", "Passw0rd!");
    await db.run("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'");
    expect(await auth.getUserBySessionToken(login.token)).toBeNull();
  });
});

describe("entitlements", () => {
  const published = { access: "paid" as const, status: "published" as const };
  const free = { access: "free" as const, status: "published" as const };

  it("decides access on the server for every combination", async () => {
    const db = await freshDb();
    await makeUser(db, "admin@example.com");
    const student = await makeUser(db, "s@example.com");
    const svc = new EntitlementService(db);
    const none = await svc.getEntitlement(student, COURSE_ID);
    expect(decideLessonAccess(null, free, none).reason).toBe("login_required");
    expect(decideLessonAccess(student, free, none).allowed).toBe(true);
    expect(decideLessonAccess(student, published, none).reason).toBe("subscription_required");
    expect(decideLessonAccess(student, { access: "free", status: "review" }, none).reason).toBe("not_published");
  });

  it("grants manual access with a reference, and revocation takes effect immediately", async () => {
    const db = await freshDb();
    const admin = await makeUser(db, "admin@example.com");
    const student = await makeUser(db, "s@example.com");
    const svc = new EntitlementService(db);
    await expect(svc.grantManual(student.id, COURSE_ID, null, "  ", admin.id)).rejects.toThrow();
    const ent = await svc.grantManual(student.id, COURSE_ID, new Date(Date.now() + 30 * 86400_000), "חשבונית 1001", admin.id);
    expect((await svc.getEntitlement(student, COURSE_ID)).reason).toBe("active");
    expect(await db.get("SELECT id FROM audit_log WHERE action = 'entitlement.grant.admin'")).toBeTruthy();
    await svc.revoke(ent.id, admin.id, "refund");
    expect((await svc.getEntitlement(student, COURSE_ID)).hasAccess).toBe(false);
  });

  it("expires access at the end date", async () => {
    const db = await freshDb();
    const admin = await makeUser(db, "admin@example.com");
    const student = await makeUser(db, "s@example.com");
    const svc = new EntitlementService(db);
    await svc.grantManual(student.id, COURSE_ID, new Date(Date.now() + 86400_000), "מלגה", admin.id);
    expect((await svc.getEntitlement(student, COURSE_ID)).hasAccess).toBe(true);
    const later = await svc.getEntitlement(student, COURSE_ID, new Date(Date.now() + 2 * 86400_000));
    expect(later.hasAccess).toBe(false);
    expect(later.reason).toBe("expired");
  });

  it("has no simulated payment: checkout fails until a real provider is configured", async () => {
    const provider = getPaymentProvider("none");
    expect(provider.available).toBe(false);
    await expect(provider.createCheckout({} as never)).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
  });
});
