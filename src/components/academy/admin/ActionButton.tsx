"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminAction } from "../client";
import { btn } from "../ui";

/** One-click admin action with optional confirmation; refreshes the page on success. */
export default function ActionButton({
  action, payload = {}, label, confirm, variant = "secondary", onDone,
}: {
  action: string; payload?: Record<string, unknown>; label: string; confirm?: string; variant?: keyof typeof btn; onDone?: (result: unknown) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        className={btn[variant]}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError("");
          try {
            const result = await adminAction(action, payload);
            onDone?.(result);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "שגיאה");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : label}
      </button>
      {error && <span className="max-w-xs text-xs text-rose-700">{error}</span>}
    </span>
  );
}
