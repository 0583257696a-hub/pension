"use client";

import { useState } from "react";
import type { StoredCalculator } from "@/academy/services/types";
import CalculatorWalkthrough from "./CalculatorWalkthrough";
import Md from "./Md";

/** Worked example: calculator solution first when verified, formula as the alternative. */
export default function ExampleSolution({ problem, formula, calculator }: { problem: string; formula: string; calculator: (StoredCalculator & { modelName: string }) | null }) {
  const [tab, setTab] = useState<"calculator" | "formula">(calculator ? "calculator" : "formula");
  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 px-3 pb-3 pt-2 text-[15px] ${active ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`;
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="p-5 text-[15px]"><Md text={problem} className="!text-body" /></div>
      <div className="flex gap-1 border-y border-line bg-surface-2 px-4">
        {calculator && (
          <button type="button" onClick={() => setTab("calculator")} className={tabClass(tab === "calculator")}>פתרון במחשבון פיננסי</button>
        )}
        <button type="button" onClick={() => setTab("formula")} className={tabClass(tab === "formula")}>פתרון באמצעות נוסחה</button>
      </div>
      <div className="p-5">
        {tab === "calculator" && calculator ? (
          <CalculatorWalkthrough sequence={calculator.sequence} interpretation={calculator.interpretation} modelName={calculator.modelName} />
        ) : (
          <div className="ltr rounded-md bg-surface p-4 text-start font-mono text-[15px] text-ink">{formula}</div>
        )}
      </div>
    </div>
  );
}
