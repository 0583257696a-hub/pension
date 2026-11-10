"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../client";
import { btn } from "../ui";

export default function HelpStatusButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(`/api/academy/help/${requestId}`, payload);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btn.ghost} disabled={busy} onClick={() => run({ assignToMe: true })}>שיוך אליי</button>
      <button type="button" className={btn.ghost} disabled={busy} onClick={() => run({ status: "in_progress" })}>בטיפול</button>
      <button type="button" className={btn.ghost} disabled={busy} onClick={() => run({ status: "closed" })}>סגירה</button>
    </div>
  );
}
