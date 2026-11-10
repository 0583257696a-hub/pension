"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { btn } from "./ui";

/** Reply box for a help thread (student or staff). Staff can also close the request. */
export default function HelpReply({ requestId, staff }: { requestId: string; staff: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (close = false) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/academy/help/${requestId}`, { body: text, close });
      setText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <label htmlFor="reply" className="text-[15px] font-semibold text-ink">{staff ? "תשובה לתלמיד" : "הוספת הודעה"}</label>
      <textarea id="reply" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="mt-2 w-full rounded-md border border-input p-3 text-[15px] outline-none focus:border-accent" />
      {error && <p className="mt-2 text-sm text-danger-ink" role="alert">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn.primary} disabled={busy || !text.trim()} onClick={() => send(false)}>שליחה</button>
        {staff && <button type="button" className={btn.secondary} disabled={busy || !text.trim()} onClick={() => send(true)}>שליחה וסגירת הפנייה</button>}
      </div>
    </div>
  );
}
