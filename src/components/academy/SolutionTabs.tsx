"use client";

import { useState } from "react";
import type { SolutionPresentation } from "@/academy/services/types";
import CalculatorSteps from "./CalculatorSteps";
import Md from "./Md";
import TutorChat from "./TutorChat";
import VideoPlayer from "./VideoPlayer";

type Tab = "calculator" | "formula" | "video" | "tutor";

/**
 * One verified solution record, several presentations.
 * The calculator tab opens by default whenever a verified calculator solution exists.
 * Tabs without content (no verified sequence, no approved video) are not shown.
 */
export default function SolutionTabs({ solution, lessonId, initialTab }: { solution: SolutionPresentation; lessonId: string; initialTab?: Tab }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    ...(solution.calculator ? [{ id: "calculator" as const, label: "פתרון במחשבון פיננסי" }] : []),
    { id: "formula", label: solution.isCalculation ? "פתרון באמצעות נוסחה" : "פתרון מלא" },
    ...(solution.video ? [{ id: "video" as const, label: "סרטון הסבר" }] : []),
    { id: "tutor", label: "שאל את המורה AI" },
  ];
  const fallback: Tab = solution.calculator ? "calculator" : "formula";
  const [tab, setTab] = useState<Tab>(initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : fallback);

  return (
    <div className="mt-4">
      <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-bold ${tab === t.id ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4" role="tabpanel">
        {tab === "calculator" && solution.calculator && (
          <CalculatorSteps sequence={solution.calculator.sequence} interpretation={solution.calculator.interpretation} modelName={solution.calculator.modelName} />
        )}
        {tab === "formula" && (
          <div className="space-y-3">
            {solution.isCalculation && !solution.calculator && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">לשאלה זו מוצג הפתרון המתמטי המאומת.</p>
            )}
            <ol className="space-y-3">
              {solution.formulaSteps.map((s, i) => (
                <li key={i} className="rounded-xl border border-slate-200 p-3">
                  <div className="font-bold text-slate-900">{i + 1}. {s.title}</div>
                  <div className="mt-1 text-sm"><Md text={s.body_md} /></div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {tab === "video" && solution.video && <VideoPlayer assetId={solution.video.id} url={solution.video.url} title={solution.video.title} />}
        {tab === "tutor" && <TutorChat lessonId={lessonId} questionId={solution.questionId} compact />}
      </div>
    </div>
  );
}
