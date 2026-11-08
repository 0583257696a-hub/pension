"use client";

import { useEffect, useMemo, useState } from "react";
import type { SolutionPresentation, StudentQuestion } from "@/academy/services/types";
import { api } from "./client";
import Md from "./Md";
import SolutionTabs from "./SolutionTabs";
import { btn } from "./ui";

interface QuizResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  passScore: number;
  results: Array<{ questionId: string; chosenKey: string | null; correctKey: string; isCorrect: boolean }>;
}

/** Lesson quiz, unit exam or timed simulation. Answers are graded on the server. */
export default function QuizRunner({ quizId, questions, timeLimitMinutes, passScore, lessonIdByQuestion }: {
  quizId: string; questions: StudentQuestion[]; timeLimitMinutes: number | null; passScore: number; lessonIdByQuestion: Record<string, string>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());
  const [remaining, setRemaining] = useState(timeLimitMinutes ? timeLimitMinutes * 60 : null);
  const [openSolution, setOpenSolution] = useState<{ id: string; solution: SolutionPresentation } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = useMemo(
    () => async () => {
      setBusy(true);
      setError("");
      try {
        setResult(await api<QuizResult>(`/api/academy/quizzes/${quizId}/submit`, { answers, startedAt }));
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setBusy(false);
      }
    },
    [answers, quizId, startedAt],
  );

  useEffect(() => {
    if (remaining === null || result || busy) return;
    const t = setTimeout(() => {
      if (remaining <= 1) {
        setRemaining(0);
        void submit(); // time is up: the exam is submitted automatically
      } else {
        setRemaining(remaining - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [remaining, result, busy, submit]);

  const resultById = new Map(result?.results.map((r) => [r.questionId, r]) ?? []);

  return (
    <div className="space-y-4">
      {remaining !== null && !result && (
        <div className="sticky top-16 z-30 flex justify-center">
          <span className={`ltr rounded-full px-4 py-1 text-sm font-bold shadow ${remaining < 120 ? "bg-rose-600 text-white" : "bg-slate-900 text-white"}`}>
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
          </span>
        </div>
      )}
      {result && (
        <div className={`rounded-2xl p-5 ${result.passed ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          <div className="text-2xl font-extrabold">ציון: {result.score}</div>
          <div className="mt-1 text-sm">{result.correct} מתוך {result.total} תשובות נכונות · ציון עובר {result.passScore}. {result.passed ? "עברת בהצלחה!" : "כדאי לחזור על החומר ולנסות שוב."}</div>
        </div>
      )}
      {questions.map((q, i) => {
        const r = resultById.get(q.id);
        return (
          <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-500">שאלה {i + 1}</div>
            <div className="font-semibold text-slate-900"><Md text={q.stem} /></div>
            <div className="mt-3 grid gap-2">
              {q.options.map((o) => {
                const chosen = answers[q.id] === o.key;
                const correct = r && r.correctKey === o.key;
                const wrong = r && chosen && !r.isCorrect;
                return (
                  <label key={o.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-sm ${correct ? "border-emerald-500 bg-emerald-50" : wrong ? "border-rose-500 bg-rose-50" : chosen ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                    <input type="radio" className="mt-1" name={q.id} disabled={!!result} checked={chosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.key }))} />
                    <span>{o.text}</span>
                  </label>
                );
              })}
            </div>
            {r && (
              <div className="mt-3">
                <button
                  type="button"
                  className={btn.ghost}
                  onClick={async () => {
                    if (openSolution?.id === q.id) return setOpenSolution(null);
                    const solution = await api<SolutionPresentation>(`/api/academy/questions/${q.id}/solution`, undefined, "GET");
                    setOpenSolution({ id: q.id, solution });
                  }}
                >
                  {openSolution?.id === q.id ? "הסתרת הפתרון" : "צפה בפתרון"}
                </button>
                {openSolution?.id === q.id && <SolutionTabs solution={openSolution.solution} lessonId={lessonIdByQuestion[q.id]} />}
              </div>
            )}
          </div>
        );
      })}
      {!result && (
        <div className="flex items-center gap-3">
          <button type="button" className={btn.primary} disabled={busy} onClick={() => void submit()}>הגשת המבחן</button>
          <span className="text-sm text-slate-500">ענית על {Object.keys(answers).length} מתוך {questions.length} · ציון עובר {passScore}</span>
        </div>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
