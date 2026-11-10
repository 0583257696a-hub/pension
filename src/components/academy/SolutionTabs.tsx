"use client";

import { useState } from "react";
import type { SolutionPresentation } from "@/academy/services/types";
import CalculatorWalkthrough from "./CalculatorWalkthrough";
import Md from "./Md";
import VideoPlayer from "./VideoPlayer";

type Tab = "calculator" | "formula" | "video";

/**
 * One verified solution record, several presentations (design 04).
 * The calculator tab opens by default whenever a verified calculator solution exists;
 * the calculator tab appears only for a fully verified sequence. The video tab
 * is always listed and says so plainly when the approved video is not ready.
 * There is no AI chat here: help goes through the human "צריכים עזרה?" form.
 */
export default function SolutionTabs({ solution, initialTab }: { solution: SolutionPresentation; initialTab?: Tab }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    ...(solution.calculator ? [{ id: "calculator" as const, label: "פתרון במחשבון פיננסי" }] : []),
    { id: "formula", label: solution.isCalculation ? "פתרון באמצעות נוסחה" : "פתרון מלא" },
    { id: "video" as const, label: "סרטון הסבר" },
  ];
  const fallback: Tab = solution.calculator ? "calculator" : "formula";
  const [tab, setTab] = useState<Tab>(initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : fallback);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <div role="tablist" aria-label="דרכי פתרון" className="flex gap-1 overflow-x-auto border-b border-line bg-surface-2 px-4 sm:px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 pb-3.5 pt-4 text-[15px] ${tab === t.id ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-7" role="tabpanel">
        {tab === "calculator" && solution.calculator && (
          <CalculatorWalkthrough sequence={solution.calculator.sequence} interpretation={solution.calculator.interpretation} modelName={solution.calculator.modelName} />
        )}
        {tab === "formula" && (
          <div className="flex flex-col gap-3">
            {solution.isCalculation && !solution.calculator && (
              <p className="rounded-md bg-surface px-3 py-2 text-[13px] text-muted">לשאלה זו מוצג הפתרון המתמטי המאומת.</p>
            )}
            <ol className="flex flex-col gap-2">
              {solution.formulaSteps.map((s, i) => (
                <li key={i} className="flex gap-3.5 rounded-md border border-line p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-line-soft text-[13px] font-bold text-subtle">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-ink">{s.title}</div>
                    <div className="mt-1 text-[15px]"><Md text={s.body_md} /></div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {tab === "video" &&
          (solution.video ? (
            <VideoPlayer assetId={solution.video.id} url={solution.video.url} title={solution.video.title} />
          ) : (
            <p className="rounded-md bg-surface px-4 py-6 text-center text-[15px] text-muted">סרטון הפתרון לשאלה זו בהכנה ויתווסף לאחר בדיקה מקצועית.</p>
          ))}
      </div>
    </section>
  );
}
