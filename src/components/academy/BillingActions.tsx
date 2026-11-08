"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { btn } from "./ui";

export default function BillingActions({ canStartTrial, canCancel, checkoutAvailable }: { canStartTrial: boolean; canCancel: boolean; checkoutAvailable: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: "trial" | "checkout" | "cancel") => {
    if (action === "cancel" && !window.confirm("לבטל את חידוש המנוי? הגישה תישאר עד סוף התקופה ששולמה.")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await api<{ redirectUrl?: string }>("/api/academy/billing", { action });
      if (res.redirectUrl) {
        window.location.assign(res.redirectUrl);
        return;
      }
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canStartTrial && <button type="button" className={btn.primary} disabled={busy} onClick={() => run("trial")}>התחלת תקופת ניסיון</button>}
        {checkoutAvailable ? (
          <button type="button" className={btn.dark} disabled={busy} onClick={() => run("checkout")}>רכישת מנוי</button>
        ) : (
          <span className="rounded-md bg-surface px-3 py-2 text-sm text-muted">רכישה מקוונת תיפתח בקרוב. להצטרפות כמנוי פנו לצוות האקדמיה.</span>
        )}
        {canCancel && <button type="button" className={btn.ghost} disabled={busy} onClick={() => run("cancel")}>ביטול חידוש המנוי</button>}
      </div>
      {message && <p className="text-sm text-danger-ink">{message}</p>}
    </div>
  );
}
