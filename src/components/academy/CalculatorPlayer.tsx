"use client";

import { useEffect, useMemo, useState } from "react";
import type { TraceFrame } from "@/academy/calculator/fc200v/simulator";
import CalculatorFace, { EXTRA_KEYS } from "./CalculatorFace";

/**
 * Deterministic FC-200V animation for video segments. Every frame comes from
 * the simulator trace of a verified sequence, with fixed timing, so the same
 * sequence always renders the same video. Same face as the student walkthrough
 * (schematic key layout).
 */
const PRESS_MS = 700;
const STEP_HOLD_MS = 1800;

export interface PlayerStep {
  explanation: string;
}

export default function CalculatorPlayer({ frames, steps, title, mode, modelName, verified, autoplay, fixedFrame }: {
  frames: TraceFrame[]; steps: PlayerStep[]; title: string; mode: string; modelName: string; verified: boolean; autoplay: boolean; fixedFrame: number | null;
}) {
  const showExtra = frames.some((f) => EXTRA_KEYS.has(f.key));
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
      <div className="shrink-0">
        <CalculatorFace hot={frame ? [frame.key] : []} top={mode} main={frame?.display ?? ""} modelName={modelName} showExtra={showExtra} />
      </div>
      <div className="w-full flex-1">
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        {!verified && <p className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-sm font-bold text-danger-ink">הרצף טרם אומת במלואו. אין להשתמש במקטע זה בסרטון שמפורסם.</p>}
        <ol className="mt-4 flex flex-col gap-1">
          {steps.map((s, i) => {
            const active = frame && frame.stepIndex === i;
            const done = frame && frame.stepIndex > i;
            return (
              <li key={i} className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-[15px] ${active ? "border-accent-line bg-accent-soft font-semibold" : "border-transparent"} ${done ? "text-muted" : "text-ink"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${active ? "bg-accent text-white" : done ? "bg-dark text-white" : "bg-line-soft text-subtle"}`}>{done ? "✓" : i + 1}</span>
                {s.explanation}
              </li>
            );
          })}
        </ol>
        {step && <p className="sr-only">{step.explanation}</p>}
        {fixedFrame === null && (
          <div className="mt-4 flex gap-2">
            <button type="button" className="inline-flex h-11 items-center rounded-md bg-dark px-5 text-[15px] font-semibold text-white" onClick={() => { setIndex(0); setPlaying(true); }}>הפעלה מההתחלה</button>
            <button type="button" className="inline-flex h-11 items-center rounded-md border border-input px-4 text-[15px] font-semibold" onClick={() => setPlaying((p) => !p)}>{playing ? "השהיה" : "המשך"}</button>
            <span className="ltr self-center text-xs text-muted">{Math.round(totalMs / 1000)}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
