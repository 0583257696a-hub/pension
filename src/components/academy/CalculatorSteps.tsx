import { FC200V } from "@/academy/calculator/fc200v/model";
import type { CalcSequence } from "@/academy/calculator/types";

/** Renders a key as it looks on the FC-200V (shifted functions show both presses). */
export function KeyCap({ id }: { id: string }) {
  const def = FC200V.keys[id];
  if (!def) {
    return <span className="inline-flex rounded-md border border-dashed border-amber-400 bg-warn-soft px-2 py-1 text-xs font-bold text-warn-ink">ניקוי נתונים לפי המדריך</span>;
  }
  const presses = def.press ?? [id];
  return (
    <span className="inline-flex items-center gap-1" title={def.press ? `${def.label}` : undefined}>
      {presses.map((p, i) => {
        const k = FC200V.keys[p];
        const isShift = p === "SHIFT";
        const isMode = ["CMPD", "CNVR", "CASH", "COMP", "SOLVE", "EXE", "ESC"].includes(p);
        return (
          <kbd
            key={i}
            className={`ltr inline-flex min-w-8 items-center justify-center rounded-md border-b-2 px-2 py-1 text-xs font-bold ${
              isShift ? "border-amber-700 bg-amber-500 text-white" : isMode ? "border-ink bg-body text-white" : "border-faint bg-white text-ink"
            }`}
          >
            {k?.label ?? p}
          </kbd>
        );
      })}
      {def.press && <span className="text-[11px] font-semibold text-muted">({def.label})</span>}
    </span>
  );
}

export function CalcDisplay({ text, small = false }: { text: string; small?: boolean }) {
  return (
    <div className={`ltr calc-display inline-block rounded-md border border-muted bg-calc-screen text-ink shadow-inner ${small ? "px-2 py-0.5 text-sm" : "px-3 py-1.5 text-base"}`}>
      {text}
    </div>
  );
}

/** Full calculator-first presentation of one verified sequence. */
export default function CalculatorSteps({ sequence, interpretation, modelName }: { sequence: CalcSequence; interpretation: string; modelName: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{modelName}</span>
          <span className="text-muted">·</span>
          <span>מצב:</span>
          <KeyCap id={sequence.mode} />
        </div>
        <p className="mt-2 text-body">{sequence.modeExplanation}</p>
        <p className="mt-1 text-xs text-muted">{sequence.reset.required ? "⚠ " : ""}{sequence.reset.note}</p>
      </div>

      <div>
        <h4 className="mb-2 font-bold text-ink">נתונים להזנה</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sequence.inputs.map((inp) => (
            <div key={inp.variable} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="text-muted">{inp.meaning}</span>
              <span className="ltr font-mono font-bold text-ink">{inp.variable} = {inp.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-bold text-ink">רצף המקשים</h4>
        <ol className="space-y-2">
          {sequence.steps.map((step, i) => (
            <li key={i} className="rounded-xl border border-line p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
                  <div className="ltr flex flex-wrap items-center justify-end gap-1">{step.keys.map((k, j) => <KeyCap key={j} id={k} />)}</div>
                </div>
                {step.expectDisplay && <CalcDisplay text={step.expectDisplay} small />}
              </div>
              <p className="mt-2 text-sm text-body">{step.explanation}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border-2 border-success-line bg-success-tint p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-bold text-success-ink">התצוגה הסופית</span>
          <CalcDisplay text={sequence.result.display} />
        </div>
        <p className="mt-2 text-sm text-success-ink">{interpretation}</p>
      </div>

      {sequence.commonMistakes.length > 0 && (
        <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn-ink">
          <h4 className="font-bold">טעויות הקלדה נפוצות</h4>
          <ul className="mt-1 list-disc space-y-1 ps-5">{sequence.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
