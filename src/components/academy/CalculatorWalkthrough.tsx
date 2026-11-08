"use client";

import { useMemo, useState } from "react";
import { FC200V } from "@/academy/calculator/fc200v/model";
import { trace } from "@/academy/calculator/fc200v/simulator";
import type { CalcSequence } from "@/academy/calculator/types";
import CalculatorFace, { EXTRA_KEYS } from "./CalculatorFace";

const MODE_NAME: Record<string, string> = {
  CMPD: "ריבית דריבית",
  CNVR: "המרת ריבית",
  CASH: "תזרימי מזומנים",
  COMP: "חישוב רגיל",
};

function keyLabel(id: string): string {
  const def = FC200V.keys[id];
  if (!def) return id === "CLR_DATA" ? "ניקוי נתונים" : id;
  if (def.press) return def.press.map((p) => FC200V.keys[p]?.label ?? p).join(" ");
  return def.label;
}

/** Physical keys pressed in a step (shifted functions expand to SHIFT + key). */
function physical(keys: string[]): string[] {
  return keys.flatMap((k) => FC200V.keys[k]?.press ?? [k]);
}

/**
 * Step-by-step FC-200V walkthrough (design 04): inputs, steps, a calculator
 * face with the keys of the current step highlighted, and the display the
 * deterministic simulator produces after that step.
 */
export default function CalculatorWalkthrough({ sequence, interpretation, modelName }: { sequence: CalcSequence; interpretation: string; modelName: string }) {
  const [step, setStep] = useState(0);
  const frames = useMemo(() => trace(sequence).frames, [sequence]);
  const displays = useMemo(() => sequence.steps.map((_, i) => [...frames].reverse().find((f) => f.stepIndex === i)?.display ?? ""), [frames, sequence.steps]);
  const total = sequence.steps.length;
  const cur = Math.min(step, total - 1);
  const current = sequence.steps[cur];
  const usesExtra = sequence.steps.some((s) => physical(s.keys).some((k) => EXTRA_KEYS.has(k)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-muted">מצב מחשבון</span>
        <span className="ltr rounded-md bg-dark px-2.5 py-1 text-[13px] font-bold text-white">{sequence.mode}</span>
        <span className="text-[13px] text-muted">{MODE_NAME[sequence.mode] ?? ""}</span>
        <span className="mr-auto rounded-md bg-line-soft px-2 py-1 text-xs text-subtle">פריסת מקשים סכמטית · {modelName}</span>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <div className="overflow-hidden rounded-md border border-line">
            <div className="border-b border-line bg-surface px-4 py-2.5 text-[13px] font-semibold">נתוני השאלה במחשבון</div>
            <div dir="ltr" className="grid grid-cols-2 text-[15px] sm:grid-cols-3">
              {sequence.inputs.map((inp) => (
                <span key={inp.variable} title={inp.meaning} className="border-b border-r border-line-soft px-4 py-3">
                  <span className="text-muted">{inp.variable}</span> = <b>{inp.value.replace(/^-/, "−")}</b>
                </span>
              ))}
            </div>
          </div>

          <ol className="flex flex-col gap-1">
            {sequence.steps.map((s, i) => {
              const active = i === cur;
              const done = i < cur;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={active ? "step" : undefined}
                    className={`flex w-full items-center gap-3.5 rounded-md border px-3.5 py-3 text-right ${active ? "border-accent-line bg-accent-soft" : "border-transparent bg-white hover:bg-surface"}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${active ? "bg-accent text-white" : done ? "bg-dark text-white" : "bg-line-soft text-subtle"}`}>
                      {done ? "✓" : i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[15px] font-semibold leading-snug text-ink">{s.explanation}</span>
                      <span dir="ltr" className="text-right font-mono text-[13px] text-subtle">{s.keys.map(keyLabel).join("  ")}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex min-w-0 flex-[0_1_340px] flex-col items-center gap-4">
          <CalculatorFace hot={physical(current.keys)} top={sequence.mode} main={displays[cur]} modelName={modelName} showExtra={usesExtra} />
          <span className="max-w-[300px] text-center text-xs leading-normal text-muted">המקשים המודגשים הם המקשים ללחיצה בשלב הנוכחי.</span>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 border-t border-line-soft pt-5">
        <div className="flex gap-1" aria-label="ציר התקדמות">
          {sequence.steps.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-sm ${i <= cur ? "bg-dark" : "bg-line"}`} />)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStep(Math.min(cur + 1, total - 1))} disabled={cur === total - 1} className="inline-flex h-11 items-center rounded-md bg-dark px-5 text-[15px] font-semibold text-white disabled:opacity-40">השלב הבא</button>
          <button type="button" onClick={() => setStep(Math.max(cur - 1, 0))} disabled={cur === 0} className="inline-flex h-11 items-center rounded-md border border-input bg-white px-4 text-[15px] font-semibold text-ink disabled:opacity-40">חזור לשלב הקודם</button>
          <button type="button" onClick={() => setStep(0)} className="inline-flex h-11 items-center rounded-md px-3 text-[15px] text-muted hover:text-ink">התחל מחדש</button>
          <span className="mr-auto text-[13px] text-muted">שלב {cur + 1} מתוך {total}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-line p-5">
          <h4 className="mb-2 text-[15px] font-bold">פירוש התוצאה</h4>
          <p className="text-[15px] leading-relaxed text-body">
            במסך: <span className="ltr font-mono font-bold">{sequence.result.display}</span>. {interpretation}
          </p>
        </div>
        {sequence.commonMistakes.length > 0 && (
          <div className="rounded-md border border-line p-5">
            <h4 className="mb-2 text-[15px] font-bold">טעויות נפוצות</h4>
            <ul className="list-disc space-y-1 ps-5 text-[15px] leading-relaxed text-body">
              {sequence.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
