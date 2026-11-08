"use client";

import { useState } from "react";
import type { SolutionPresentation, StudentQuestion } from "@/academy/services/types";
import { api } from "./client";
import { IconCheck, IconChevronLeft, IconChevronRight, IconX } from "./icons";
import Md from "./Md";
import SolutionTabs from "./SolutionTabs";
import { Badge, optionLetter } from "./ui";

interface AnswerResult {
  isCorrect: boolean;
  chosenKey: string;
  solution: SolutionPresentation;
}

const DIFFICULTY: Record<number, [string, "green" | "amber" | "red"]> = { 1: ["קושי בסיסי", "green"], 2: ["קושי בינוני", "amber"], 3: ["קושי גבוה", "red"] };

/** Practice flow (design 04): question card, answer check, result banner, solution tabs. */
export default function QuestionPractice({ questions, lessonId, contextLabel, staffPreview = false }: {
  questions: StudentQuestion[]; lessonId: string; contextLabel?: string; staffPreview?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const [tabHint, setTabHint] = useState<"tutor" | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!questions.length) return <p className="text-[15px] text-muted">אין עדיין שאלות תרגול שאושרו לשיעור זה.</p>;
  const q = questions[index];
  const result = results[q.id];

  async function check() {
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<AnswerResult>(`/api/academy/questions/${q.id}/answer`, { chosenKey: chosen });
      setResults((all) => ({ ...all, [q.id]: r }));
      setTabHint(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  function go(next: number) {
    const target = (next + questions.length) % questions.length;
    setIndex(target);
    setChosen(results[questions[target].id]?.chosenKey ?? null);
    setError("");
    setTabHint(undefined);
  }

  function retry() {
    setResults((all) => {
      const copy = { ...all };
      delete copy[q.id];
      return copy;
    });
    setChosen(null);
  }

  const [diffLabel, diffTone] = DIFFICULTY[q.difficulty] ?? ["", "green"];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-base font-bold text-ink">שאלה {index + 1} מתוך {questions.length}</span>
        <div className="flex gap-1" aria-hidden="true">
          {questions.map((x, i) => {
            const r = results[x.id];
            const color = i === index ? "bg-dark" : r ? (r.isCorrect ? "bg-success" : "bg-danger") : "bg-line";
            return <span key={x.id} className={`h-1.5 w-5 rounded-sm ${color}`} />;
          })}
        </div>
        {diffLabel && <Badge tone={diffTone}>{diffLabel}</Badge>}
        {staffPreview && <Badge tone="violet">תצוגת צוות</Badge>}
      </div>

      <section className="rounded-xl border border-line bg-white p-5 sm:p-10">
        {contextLabel && <div className="mb-3 text-[13px] text-muted">{contextLabel}</div>}
        <div className="text-lg font-medium leading-relaxed text-ink sm:text-xl sm:leading-relaxed"><Md text={q.stem} className="!text-ink" /></div>

        <div className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label="תשובות">
          {q.options.map((o) => {
            const isSel = (result?.chosenKey ?? chosen) === o.key;
            const isRight = result && result.solution.correctKey === o.key;
            const isWrongSel = result && isSel && !result.isCorrect;
            const box = isRight ? "border-success bg-success-tint" : isWrongSel ? "border-danger bg-danger-soft" : isSel ? "border-accent bg-accent-tint" : "border-line bg-white hover:border-input";
            const letter = isRight ? "bg-success text-white" : isWrongSel ? "bg-danger text-white" : isSel ? "bg-accent text-white" : "bg-line-soft text-body";
            const tag = isRight ? (isSel ? "התשובה שלך · נכונה" : "התשובה הנכונה") : isWrongSel ? "התשובה שלך" : "";
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={isSel}
                disabled={!!result}
                onClick={() => setChosen(o.key)}
                className={`flex min-h-[60px] w-full items-center gap-4 rounded-md border-[1.5px] px-4 py-3 text-right text-ink transition-colors ${box}`}
              >
                <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-sm font-bold ${letter}`}>{optionLetter(o.key)}</span>
                <span className="flex-1 text-[17px] font-semibold">{o.text}</span>
                {tag && <span className={`text-[13px] font-semibold ${isRight ? "text-success-ink" : "text-danger-ink"}`}>{tag}</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-soft pt-6">
          {!result && (
            <button type="button" disabled={!chosen || busy} onClick={check} className="inline-flex h-11 items-center rounded-md bg-accent px-6 text-[15px] font-semibold text-white hover:bg-accent-hover disabled:bg-faint">
              {busy ? "בודק…" : "בדיקת תשובה"}
            </button>
          )}
          {questions.length > 1 && (
            <div className="mr-auto flex gap-2">
              <button type="button" onClick={() => go(index - 1)} className="inline-flex h-11 items-center gap-1.5 rounded-md border border-input bg-white px-4 text-[15px] font-semibold text-ink hover:bg-surface">
                <IconChevronRight size={16} /> השאלה הקודמת
              </button>
              <button type="button" onClick={() => go(index + 1)} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-dark px-5 text-[15px] font-semibold text-white hover:bg-black">
                השאלה הבאה <IconChevronLeft size={16} />
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger-ink">{error}</p>}
      </section>

      {result && (
        <>
          <div role="status" className={`flex flex-wrap items-center gap-4 rounded-xl border px-6 py-4 ${result.isCorrect ? "border-success-line bg-success-tint" : "border-danger-line bg-danger-soft"}`}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${result.isCorrect ? "bg-success" : "bg-danger"}`}>
              {result.isCorrect ? <IconCheck size={16} /> : <IconX size={16} />}
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className={`text-[17px] font-bold ${result.isCorrect ? "text-success-ink" : "text-danger-ink"}`}>{result.isCorrect ? "תשובה נכונה" : `לא מדויק. התשובה הנכונה: ${optionLetter(result.solution.correctKey)}`}</span>
              <span className="text-sm text-body"><Md text={result.solution.explanation} className="!text-body [&_p]:my-0" /></span>
            </span>
            <div className="flex gap-2">
              {!result.isCorrect && (
                <button type="button" onClick={retry} className="inline-flex h-10 items-center rounded-md border border-input bg-white px-3.5 text-sm font-semibold">נסו שוב</button>
              )}
              <button type="button" onClick={() => setTabHint((t) => (t === "tutor" ? undefined : "tutor"))} className="inline-flex h-10 items-center rounded-md bg-accent-soft px-3.5 text-sm font-semibold text-accent-hover">שאל את המורה AI</button>
            </div>
          </div>
          <SolutionTabs key={`${q.id}-${tabHint ?? "default"}`} solution={result.solution} lessonId={lessonId} initialTab={tabHint} />
          {staffPreview && result.solution.calculatorUnavailableReason && (
            <p className="rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-hover">לצוות: {result.solution.calculatorUnavailableReason}</p>
          )}
        </>
      )}
    </div>
  );
}
