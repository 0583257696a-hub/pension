"use client";

import { useRef, useState } from "react";
import { api } from "./client";

interface Checkpoint { atSeconds: number | null; question: number; title: string }
interface Chapter { atSeconds: number | null; title: string }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Lesson video with player chapters and practice checkpoints (spec §7.3–7.4).
 * At a checkpoint the video pauses and invites the student to solve the
 * question from the questions PDF; "המשך צפייה" resumes at the same point.
 * Timings come from the editor; untimed checkpoints are listed but do not pause.
 */
export default function LessonVideo({ assetId, url, title, chapters, checkpoints }: {
  assetId: string; url: string; title: string; chapters: Chapter[]; checkpoints: Checkpoint[];
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSent = useRef(0);
  const done = useRef(new Set<number>());
  const [pausedAt, setPausedAt] = useState<Checkpoint | null>(null);
  const [pauses, setPauses] = useState(true);

  const report = (video: HTMLVideoElement, completed: boolean) => {
    const now = Date.now();
    if (!completed && now - lastSent.current < 15000) return;
    lastSent.current = now;
    api("/api/academy/videos/progress", { assetId, seconds: Math.floor(video.currentTime), completed }).catch(() => undefined);
  };

  const onTime = (video: HTMLVideoElement) => {
    report(video, false);
    if (!pauses) return;
    const hit = checkpoints.find((c) => c.atSeconds !== null && !done.current.has(c.question) && video.currentTime >= c.atSeconds && video.currentTime < c.atSeconds + 1.5);
    if (hit) {
      done.current.add(hit.question);
      video.pause();
      setPausedAt(hit);
    }
  };

  const seek = (seconds: number) => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => undefined);
  };

  const timedChapters = chapters.filter((c) => c.atSeconds !== null);
  const timedCheckpoints = checkpoints.filter((c) => c.atSeconds !== null);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={ref}
          className="aspect-video w-full"
          controls
          preload="metadata"
          playsInline
          src={url}
          aria-label={title}
          onTimeUpdate={(e) => onTime(e.currentTarget)}
          onPause={(e) => report(e.currentTarget, false)}
          onEnded={(e) => report(e.currentTarget, true)}
        >
          הדפדפן אינו תומך בהצגת וידאו.
        </video>
        {pausedAt && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 p-6 text-center text-white" role="dialog" aria-label="עצירה לתרגול">
            <div className="max-w-md">
              <div className="text-sm text-brand-300">תרגול עצמי</div>
              <div className="mt-2 text-xl font-bold">{pausedAt.title}</div>
              <p className="mt-2 text-[15px] text-white/80">פתחו את קובץ שאלות השיעור, פתרו את שאלה {pausedAt.question} במחשבון, ואז המשיכו לצפות בפתרון.</p>
              <button
                type="button"
                className="mt-5 inline-flex h-11 items-center rounded-md bg-white px-5 text-[15px] font-semibold text-ink"
                onClick={() => {
                  setPausedAt(null);
                  void ref.current?.play().catch(() => undefined);
                }}
              >
                המשך צפייה
              </button>
            </div>
          </div>
        )}
      </div>
      {(timedChapters.length > 0 || timedCheckpoints.length > 0) && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
          {timedChapters.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-ink">פרקים בסרטון</div>
              <div className="flex flex-wrap gap-2">
                {timedChapters.map((c) => (
                  <button key={c.title} type="button" onClick={() => seek(c.atSeconds!)} className="rounded-md border border-line px-3 py-1.5 text-sm text-body hover:bg-surface">
                    <span className="ltr ml-1.5 text-muted">{mmss(c.atSeconds!)}</span>{c.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {timedCheckpoints.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={pauses} onChange={(e) => setPauses(e.target.checked)} />
              לעצור את הסרטון בנקודות התרגול ({timedCheckpoints.length})
            </label>
          )}
        </div>
      )}
    </div>
  );
}
