"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { btn, input } from "./ui";

export default function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const target = next && next.startsWith("/academy") ? next : "/academy/dashboard";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api(`/api/academy/auth/${mode}`, mode === "login" ? { email: form.email, password: form.password } : form);
          router.push(target);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "שגיאה");
          setBusy(false);
        }
      }}
    >
      {mode === "register" && (
        <>
          <label className="block text-sm font-semibold text-slate-700">שם מלא<input className={`${input} mt-1`} value={form.full_name} onChange={set("full_name")} required autoComplete="name" /></label>
          <label className="block text-sm font-semibold text-slate-700">טלפון (לא חובה)<input className={`${input} mt-1`} value={form.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" /></label>
        </>
      )}
      <label className="block text-sm font-semibold text-slate-700">אימייל<input className={`${input} ltr mt-1`} type="email" value={form.email} onChange={set("email")} required autoComplete="email" /></label>
      <label className="block text-sm font-semibold text-slate-700">
        סיסמה
        <input className={`${input} ltr mt-1`} type="password" value={form.password} onChange={set("password")} required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "register" && <span className="mt-1 block text-xs font-normal text-slate-500">לפחות 8 תווים, אותיות וספרות</span>}
      </label>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button type="submit" className={`${btn.primary} w-full`} disabled={busy}>{busy ? "רגע…" : mode === "login" ? "כניסה" : "יצירת חשבון"}</button>
      <p className="text-center text-sm text-slate-600">
        {mode === "login" ? (
          <>אין לך חשבון? <Link className="font-bold text-brand-700" href="/academy/register">להרשמה</Link></>
        ) : (
          <>כבר רשום? <Link className="font-bold text-brand-700" href="/academy/login">לכניסה</Link></>
        )}
      </p>
    </form>
  );
}
