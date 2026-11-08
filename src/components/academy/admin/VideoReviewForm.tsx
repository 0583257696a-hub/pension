"use client";

import ActionForm from "./ActionForm";

/** Academic + calculator-sequence review of a video version. Every item must be ticked to approve. */
export default function VideoReviewForm({ assetId, checklist }: { assetId: string; checklist: Array<{ key: string; label: string }> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-success-line bg-success-tint p-3">
        <h4 className="mb-2 font-bold text-success-ink">אישור אקדמי ובדיקת רצף המחשבון</h4>
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
      <div className="rounded-xl border border-danger-line bg-danger-soft p-3">
        <h4 className="mb-2 font-bold text-danger-ink">דחייה</h4>
        <ActionForm action="video.review" payload={{ assetId, decision: "reject", checklist: {} }} submitLabel="דחיית הגרסה" variant="danger"
          fields={[{ name: "note", label: "מה צריך לתקן", type: "textarea", required: true }]} />
      </div>
    </div>
  );
}
