"use client";

import { useEffect, useMemo, useState } from "react";
import type { TraceFrame } from "@/academy/calculator/fc200v/simulator";

/**
 * Deterministic FC-200V animation. Every frame comes from the simulator trace
 * of a verified sequence, with fixed timing, so the same sequence always
 * renders the same video. The keypad is schematic: it shows key labels, not
 * the physical key positions.
 */
const PRESS_MS = 700;
const STEP_HOLD_MS = 1800;

const KEY_ROWS: string[][] = [
  ["CMPD", "CNVR", "CASH", "COMP"],
  ["SHIFT", "ESC", "UP", "DOWN"],
  ["SOLVE", "LPAREN", "RPAREN", "INV"],
  ["7", "8", "9", "DIV"],
  ["4", "5", "6", "MUL"],
  ["1", "2", "3", "SUB"],
  ["0", "DOT", "NEG", "ADD"],
  ["EXE"],
];

const LABELS: Record<string, string> = {
  UP: "▲", DOWN: "▼", NEG: "(-)", DOT: ".", ADD: "+", SUB: "−", MUL: "×", DIV: "÷", LPAREN: "(", RPAREN: ")", INV: "x⁻¹", CLR_DATA: "CLR",
};

export interface PlayerStep {
  explanation: string;
}

export default function CalculatorPlayer({ frames, steps, title, modelName, verified, autoplay, fixedFrame }: {
  frames: TraceFrame[]; steps: PlayerStep[]; title: string; modelName: string; verified: boolean; autoplay: boolean; fixedFrame: number | null;
}) {
  const timeline = useMemo(
    () =>
      frames.reduce<Array<TraceFrame & { start: number; end: number }>>((acc, f) => {
        const start = acc.length ? acc[acc.length - 1].end : 0;
        acc.push({ ...f, start, end: start + PRESS_MS + (f.stepEnd ? STEP_HOLD_MS : 0) });
        return acc;
      }, []),
    [frames],
  );
  const totalMs = timeline.length ? timeline[timeline.length - 1].end : 0;
  const [index, setIndex] = useState(fixedFrame ?? (autoplay ? 0 : -1));
  const [playing, setPlaying] = useState(autoplay && fixedFrame === null);

  useEffect(() => {
    (window as unknown as { __calcTimeline?: unknown }).__calcTimeline = { totalMs, frames: timeline.length, pressMs: PRESS_MS, stepHoldMs: STEP_HOLD_MS };
  }, [totalMs, timeline.length]);

  useEffect(() => {
    if (!playing) return;
    if (index >= timeline.length - 1) {
      const done = setTimeout(() => {
        setPlaying(false);
        document.body.dataset.calcDone = "1";
      }, STEP_HOLD_MS);
      return () => clearTimeout(done);
    }
    const current = timeline[index];
    const wait = index < 0 ? 600 : current.end - current.start;
    const t = setTimeout(() => setIndex((i) => i + 1), wait);
    return () => clearTimeout(t);
  }, [playing, index, timeline]);

  const frame = index >= 0 ? timeline[index] : null;
  const step = frame ? steps[frame.stepIndex] : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 p-4 md:flex-row md:items-start" data-frame={index}>
      <div className="w-full max-w-[320px] shrink-0 rounded-[28px] bg-calc-body p-5 shadow-2xl">
        <div className="mb-1 flex justify-between text-[10px] font-bold tracking-widest text-slate-300 ltr"><span>{modelName}</span><span>SCHEMATIC</span></div>
        <div className="ltr calc-display mb-4 flex h-20 flex-col justify-between rounded-lg border-4 border-slate-700 bg-calc-screen px-3 py-2 text-slate-900">
          <span className="text-[11px]">{frame?.key === "SHIFT" ? "S" : ""}</span>
          <span className="truncate text-end text-xl">{frame?.display ?? ""}</span>
        </div>
        <div className="ltr grid grid-cols-4 gap-2">
          {KEY_ROWS.flat().map((k) => {
            const active = frame?.key === k;
            const isMode = ["CMPD", "CNVR", "CASH", "COMP", "SOLVE", "EXE", "ESC"].includes(k);
            return (
              <div
                key={k}
                className={`flex h-9 items-center justify-center rounded-lg text-xs font-bold transition-all duration-150 ${k === "EXE" ? "col-span-4" : ""} ${
                  active ? "scale-110 bg-amber-400 text-slate-900 ring-4 ring-amber-200" : k === "SHIFT" ? "bg-amber-600 text-white" : isMode ? "bg-slate-600 text-white" : "bg-slate-200 text-slate-900"
                }`}
              >
                {LABELS[k] ?? k}
              </div>
            );
          })}
        </div>
      </div>
      <div className="w-full flex-1">
        <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
        {!verified && <p className="mt-2 rounded-lg bg-rose-100 px-3 py-2 text-sm font-bold text-rose-800">הרצף טרם אומת במלואו. אין להשתמש במקטע זה בסרטון שמפורסם.</p>}
        <ol className="mt-4 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className={`rounded-xl border px-3 py-2 text-sm transition ${frame && frame.stepIndex === i ? "border-amber-400 bg-amber-50 font-semibold" : frame && frame.stepIndex > i ? "border-slate-200 text-slate-400" : "border-slate-200"}`}>
              {i + 1}. {s.explanation}
            </li>
          ))}
        </ol>
        {step && <p className="sr-only">{step.explanation}</p>}
        {fixedFrame === null && (
          <div className="mt-4 flex gap-2">
            <button type="button" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white" onClick={() => { setIndex(0); setPlaying(true); }}>הפעלה מההתחלה</button>
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold" onClick={() => setPlaying((p) => !p)}>{playing ? "השהיה" : "המשך"}</button>
            <span className="ltr self-center text-xs text-slate-500">{Math.round(totalMs / 1000)}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
