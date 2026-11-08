"use client";

import ActionForm from "./ActionForm";

/** Academic + calculator-sequence review of a video version. Every item must be ticked to approve. */
export default function VideoReviewForm({ assetId, checklist }: { assetId: string; checklist: Array<{ key: string; label: string }> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <h4 className="mb-2 font-bold text-emerald-900">אישור אקדמי ובדיקת רצף המחשבון</h4>
        <ActionForm
          action="video.review"
          payload={{ assetId, decision: "approve" }}
          submitLabel="אישור הגרסה"
          fields={[
            ...checklist.map((c) => ({ name: `check_${c.key}`, label: c.label, type: "checkbox" as const })),
            { name: "note", label: "הערות (לא חובה)", type: "textarea" as const },
          ]}
        />
      </div>
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
        <h4 className="mb-2 font-bold text-rose-900">דחייה</h4>
        <ActionForm action="video.review" payload={{ assetId, decision: "reject", checklist: {} }} submitLabel="דחיית הגרסה" variant="danger"
          fields={[{ name: "note", label: "מה צריך לתקן", type: "textarea", required: true }]} />
      </div>
    </div>
  );
}
