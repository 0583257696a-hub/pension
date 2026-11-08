"use client";

import { useState, type ReactNode } from "react";

/** Lesson content tabs (design 03): summary · formulas · examples · related practice. */
export default function LessonTabs({ tabs }: { tabs: Array<{ id: string; label: string; content: ReactNode }> }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 pb-3 pt-2 text-[15px] ${active === t.id ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-6" role="tabpanel">{tabs.find((t) => t.id === active)?.content}</div>
    </div>
  );
}
