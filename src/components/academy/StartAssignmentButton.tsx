"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { btn } from "./ui";

export default function StartAssignmentButton({ assignmentId, newAttempt, label }: { assignmentId: string; newAttempt: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={btn.dark}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await api<{ attemptId: string }>(`/api/academy/assignments/${assignmentId}/start`, { newAttempt });
            router.push(`/academy/attempts/${res.attemptId}`);
          } catch (e) {
            setError(e instanceof Error ? e.message : "שגיאה");
            setBusy(false);
          }
        }}
      >
        {label}
      </button>
      {error && <p className="w-full text-sm text-danger-ink" role="alert">{error}</p>}
    </>
  );
}
