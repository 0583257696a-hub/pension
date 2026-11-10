"use client";

import { useState } from "react";
import { api } from "./client";
import { btn, input } from "./ui";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
  const [state, setState] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setState(null);
        try {
          await api("/api/academy/contact", form);
          setState({ tone: "ok", text: "ההודעה נשלחה. נחזור אליכם בהקדם." });
          setForm({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
        } catch (err) {
          setState({ tone: "error", text: err instanceof Error ? err.message : "שגיאה" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-muted">שם מלא<input required className={input} value={form.name} onChange={set("name")} /></label>
        <label className="flex flex-col gap-1 text-sm text-muted">אימייל<input required type="email" className={`${input} ltr`} value={form.email} onChange={set("email")} /></label>
        <label className="flex flex-col gap-1 text-sm text-muted">טלפון<input className={`${input} ltr`} value={form.phone} onChange={set("phone")} /></label>
        <label className="flex flex-col gap-1 text-sm text-muted">נושא<input className={input} value={form.subject} onChange={set("subject")} /></label>
      </div>
      <label className="hidden">אתר<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
      <label className="flex flex-col gap-1 text-sm text-muted">הודעה<textarea required rows={5} className="rounded-md border border-input p-3 text-[15px] text-ink outline-none focus:border-accent" value={form.message} onChange={set("message")} /></label>
      <button type="submit" className={`${btn.primary} w-fit`} disabled={busy}>שליחה</button>
      {state && <p className={`text-sm ${state.tone === "ok" ? "text-success-ink" : "text-danger-ink"}`} role="status">{state.text}</p>}
    </form>
  );
}
