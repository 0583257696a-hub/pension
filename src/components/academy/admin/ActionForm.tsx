"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { adminAction } from "../client";
import { btn, input } from "../ui";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "date" | "number" | "checkbox";
  options?: Array<[string, string]>;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | boolean;
}

/** Small declarative form for admin actions. */
export default function ActionForm({
  action, payload = {}, fields, submitLabel, variant = "primary", confirm, children, onDone, resetOnSuccess = true,
}: {
  action: string; payload?: Record<string, unknown>; fields: Field[]; submitLabel: string; variant?: "primary" | "secondary" | "danger";
  confirm?: string; children?: ReactNode; onDone?: (result: unknown) => void; resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const initial = Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "checkbox" ? false : f.options?.[0]?.[0] ?? "")]));
  const [values, setValues] = useState<Record<string, string | boolean>>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        setMessage(null);
        try {
          const result = await adminAction(action, { ...payload, ...values });
          setMessage({ ok: true, text: "נשמר" });
          if (resetOnSuccess) setValues(initial);
          onDone?.(result);
          router.refresh();
        } catch (err) {
          setMessage({ ok: false, text: err instanceof Error ? err.message : "שגיאה" });
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <label key={f.name} className={`block text-sm font-semibold text-body ${f.type === "checkbox" ? "flex items-start gap-2" : ""}`}>
          {f.type === "checkbox" ? (
            <>
              <input type="checkbox" className="mt-1" checked={!!values[f.name]} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))} />
              <span className="font-normal">{f.label}</span>
            </>
          ) : (
            <>
              {f.label}
              {f.type === "textarea" ? (
                <textarea className={`${input} mt-1 min-h-28`} value={String(values[f.name])} required={f.required} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
              ) : f.type === "select" ? (
                <select className={`${input} mt-1`} value={String(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                  {f.options?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              ) : (
                <input className={`${input} mt-1`} type={f.type ?? "text"} value={String(values[f.name])} required={f.required} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
              )}
            </>
          )}
        </label>
      ))}
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" className={btn[variant]} disabled={busy}>{busy ? "…" : submitLabel}</button>
        {message && <span className={`text-sm ${message.ok ? "text-success-ink" : "text-danger-ink"}`}>{message.text}</span>}
      </div>
    </form>
  );
}
