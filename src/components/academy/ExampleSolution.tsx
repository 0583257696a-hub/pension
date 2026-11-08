"use client";

import { useState } from "react";
import type { StoredCalculator } from "@/academy/services/types";
import CalculatorSteps from "./CalculatorSteps";
import Md from "./Md";

/** Worked example: calculator solution first when verified, formula as the alternative. */
export default function ExampleSolution({ problem, formula, calculator }: { problem: string; formula: string; calculator: (StoredCalculator & { modelName: string }) | null }) {
  const [tab, setTab] = useState<"calculator" | "formula">(calculator ? "calculator" : "formula");
  return (
    <div>
      <Md text={problem} />
      <div className="mt-3 flex gap-1 border-b border-slate-200">
        {calculator && (
          <button type="button" onClick={() => setTab("calculator")} className={`px-3 py-2 text-sm font-bold ${tab === "calculator" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500"}`}>
            פתרון במחשבון פיננסי
          </button>
        )}
        <button type="button" onClick={() => setTab("formula")} className={`px-3 py-2 text-sm font-bold ${tab === "formula" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500"}`}>
          פתרון באמצעות נוסחה
        </button>
      </div>
      <div className="pt-3">
        {tab === "calculator" && calculator ? (
          <CalculatorSteps sequence={calculator.sequence} interpretation={calculator.interpretation} modelName={calculator.modelName} />
        ) : (
          <div className="ltr rounded-xl bg-slate-50 p-3 text-start font-mono text-sm text-slate-800">{formula}</div>
        )}
      </div>
    </div>
  );
}
