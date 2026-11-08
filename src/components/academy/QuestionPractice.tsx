"use client";

import { useState } from "react";
import type { SolutionPresentation, StudentQuestion } from "@/academy/services/types";
import { api } from "./client";
import Md from "./Md";
import SolutionTabs from "./SolutionTabs";
import { Badge, btn } from "./ui";

interface AnswerResult {
  isCorrect: boolean;
  chosenKey: string;
  solution: SolutionPresentation;
}

const DIFFICULTY = ["", "קל", "בינוני", "מאתגר"];

/** Practice flow: one question at a time, answer, feedback, solution tabs, next. */
export default function QuestionPractice({ questions, lessonId, staffPreview = false }: { questions: StudentQuestion[]; lessonId: string; staffPreview?: boolean }) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [showSolution, setShowSolution] = useState<false | "default" | "tutor">(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!questions.length) return <p className="text-sm text-slate-500">אין עדיין שאלות תרגול שאושרו לשיעור זה.</p>;
  const q = questions[index];

  async function submit() {
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api<AnswerResult>(`/api/academy/questions/${q.id}/answer`, { chosenKey: chosen }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setIndex((i) => (i + 1) % questions.length);
    setChosen(null);
    setResult(null);
    setShowSolution(false);
    setError("");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-500">שאלה {index + 1} מתוך {questions.length}</span>
        <div className="flex gap-2">
          <Badge tone="blue">{DIFFICULTY[q.difficulty] ?? ""}</Badge>
          {q.hasCalculatorSolution && <Badge tone="green">פתרון במחשבון</Badge>}
          {staffPreview && <Badge tone="violet">תצוגת צוות</Badge>}
        </div>
      </div>
      <div className="text-base font-semibold text-slate-900"><Md text={q.stem} /></div>
      <div className="mt-3 grid gap-2">
        {q.options.map((o) => {
          const isChosen = chosen === o.key;
          const isCorrect = result && result.solution.correctKey === o.key;
          const isWrongChoice = result && isChosen && !result.isCorrect;
          return (
            <button
              key={o.key}
              type="button"
              disabled={!!result}
              onClick={() => setChosen(o.key)}
              className={`flex items-start gap-3 rounded-xl border-2 px-3 py-3 text-start text-sm transition ${
                isCorrect ? "border-emerald-500 bg-emerald-50" : isWrongChoice ? "border-rose-500 bg-rose-50" : isChosen ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">{o.key.toUpperCase()}</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>

      {!result && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={btn.primary} disabled={!chosen || busy} onClick={submit}>{busy ? "בודק…" : "בדיקת תשובה"}</button>
          {questions.length > 1 && <button type="button" className={btn.ghost} onClick={next}>דילוג לשאלה הבאה</button>}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      {result && (
        <div className="mt-4">
          <div className={`rounded-xl p-4 ${result.isCorrect ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
            <div className="text-lg font-extrabold">{result.isCorrect ? "✓ תשובה נכונה" : `✗ לא מדויק. התשובה הנכונה: ${result.solution.correctKey.toUpperCase()}`}</div>
            <div className="mt-1 text-sm"><Md text={result.solution.explanation} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn.primary} onClick={() => setShowSolution("default")}>צפה בפתרון</button>
            <button type="button" className={btn.secondary} onClick={() => setShowSolution("tutor")}>שאל את המורה AI</button>
            <button type="button" className={btn.secondary} onClick={next}>לשאלה הבאה ←</button>
          </div>
          {showSolution && <SolutionTabs key={showSolution} solution={result.solution} lessonId={lessonId} initialTab={showSolution === "tutor" ? "tutor" : undefined} />}
          {staffPreview && result.solution.calculatorUnavailableReason && (
            <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">לצוות: {result.solution.calculatorUnavailableReason}</p>
          )}
        </div>
      )}
    </div>
  );
}
