"use client";

import { useRef } from "react";
import { api } from "./client";

/** Plays a published video and reports watch progress (throttled). */
export default function VideoPlayer({ assetId, url, title }: { assetId: string; url: string; title: string }) {
  const lastSent = useRef(0);
  const report = (video: HTMLVideoElement, completed: boolean) => {
    const now = Date.now();
    if (!completed && now - lastSent.current < 15000) return;
    lastSent.current = now;
    api("/api/academy/videos/progress", { assetId, seconds: Math.floor(video.currentTime), completed }).catch(() => undefined);
  };
  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <video
        className="aspect-video w-full"
        controls
        preload="metadata"
        playsInline
        src={url}
        aria-label={title}
        onTimeUpdate={(e) => report(e.currentTarget, false)}
        onPause={(e) => report(e.currentTarget, false)}
        onEnded={(e) => report(e.currentTarget, true)}
      >
        הדפדפן אינו תומך בהצגת וידאו.
      </video>
    </div>
  );
}
