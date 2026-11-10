"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { SolutionPresentation } from "@/academy/services/types";
import { api } from "./client";
import Md from "./Md";
import SolutionTabs from "./SolutionTabs";
import { btn, optionLetter } from "./ui";

export interface RunnerQuestion {
  id: string;
  version: number;
  position: number;
  stem: string;
  options: Array<{ key: string; text: string }>;
  chosenKey: string | null;
  locked: boolean;
  solutionViewed: boolean;
  correctKey: string | null;
  isCorrect: boolean | null;
}

interface Props {
  attemptId: string;
  title: string;
  lessonTitle: string;
  submitted: boolean;
  practice: boolean;
  solutionPolicy: "anytime" | "after_answer" | "after_submit";
  startPosition: number;
  questions: RunnerQuestion[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * One question at a time (spec §11): four options, autosave on every choice,
 * previous / next, "צפה בפתרון", "צריכים עזרה?" and "סיום והגשה".
 * The server is the source of truth for answers, locks and the grade.
 */
export default function AssignmentRunner(props: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState(props.questions);
  const [index, setIndex] = useState(Math.min(Math.max(props.startPosition - 1, 0), props.questions.length - 1));
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [solutions, setSolutions] = useState<Record<string, SolutionPresentation>>({});
  const [confirmSolution, setConfirmSolution] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpText, setHelpText] = useState("");
  const [helpSent, setHelpSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(0);

  const q = questions[index];
  const solution = solutions[q.id];
  const answered = questions.filter((x) => x.chosenKey).length;
  const readOnly = props.submitted || q.locked;

  const go = (next: number) => {
    const target = Math.min(Math.max(next, 0), questions.length - 1);
    setIndex(target);
    setError(null);
    setConfirmSolution(false);
    setHelpOpen(false);
    setHelpSent(null);
    if (!props.submitted) api(`/api/academy/attempts/${props.attemptId}/position`, { position: target + 1 }).catch(() => undefined);
  };

  const choose = async (key: string) => {
    if (readOnly) return;
    const previous = q.chosenKey;
    setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, chosenKey: key } : x)));
    setSave("saving");
    setError(null);
    pending.current++;
    try {
      await api(`/api/academy/attempts/${props.attemptId}/answer`, { questionId: q.id, chosenKey: key, position: q.position });
      setSave("saved");
    } catch (e) {
      setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, chosenKey: previous } : x)));
      setSave("error");
      setError(e instanceof Error ? e.message : "השמירה נכשלה");
    } finally {
      pending.current--;
    }
  };

  const openSolution = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ solution: SolutionPresentation & { lockedAnswer: boolean } }>(`/api/academy/attempts/${props.attemptId}/solution`, { questionId: q.id });
      setSolutions((s) => ({ ...s, [q.id]: res.solution }));
      setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, solutionViewed: true, locked: true, correctKey: res.solution.correctKey } : x)));
      setConfirmSolution(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא ניתן להציג את הפתרון");
    } finally {
      setBusy(false);
    }
  };

  const askSolution = () => {
    if (solution) return;
    if (props.submitted || q.solutionViewed) void openSolution();
    else setConfirmSolution(true);
  };

  const submit = async () => {
    if (pending.current) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/academy/attempts/${props.attemptId}/submit`);
      router.push(`/academy/attempts/${props.attemptId}/results`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההגשה נכשלה");
      setBusy(false);
    }
  };

  const sendHelp = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/academy/help", { attemptId: props.attemptId, questionId: q.id, message: helpText });
      setHelpSent("הפנייה נשלחה לצוות. התשובה תופיע ב״הפניות שלי״.");
      setHelpText("");
      setHelpOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "השליחה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const solutionAllowed = props.submitted || props.solutionPolicy === "anytime" || (props.solutionPolicy === "after_answer" && !!q.chosenKey);
  const optionClass = (key: string) => {
    const chosen = q.chosenKey === key;
    const revealed = q.correctKey !== null;
    if (revealed && key === q.correctKey) return "border-success bg-success-soft";
    if (revealed && chosen && key !== q.correctKey) return "border-danger bg-danger-soft";
    if (chosen) return "border-ink bg-line-soft";
    return "border-line bg-white hover:border-input";
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{props.lessonTitle}</div>
          <h1 className="text-2xl font-extrabold text-ink">{props.title}{props.practice ? " · תרגול חוזר" : ""}</h1>
        </div>
        <div className="text-sm text-muted" aria-live="polite">
          {props.submitted ? "המטלה הוגשה" : save === "saving" ? "שומר…" : save === "saved" ? "התשובה נשמרה" : save === "error" ? "השמירה נכשלה" : `נענו ${answered} מתוך ${questions.length}`}
        </div>
      </div>

      <nav aria-label="מעבר בין שאלות" className="flex flex-wrap gap-1.5">
        {questions.map((x, i) => {
          const state = props.submitted ? (x.isCorrect ? "bg-success-soft text-success-ink" : "bg-danger-soft text-danger-ink") : x.chosenKey ? "bg-dark text-white" : "bg-white text-subtle";
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => go(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={`שאלה ${i + 1}${x.chosenKey ? ", נענתה" : ""}`}
              className={`ltr h-9 w-9 rounded-md border text-sm font-semibold ${state} ${i === index ? "border-accent ring-2 ring-accent-soft" : "border-line"}`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <section className="rounded-xl border border-line bg-white p-5 sm:p-7" aria-labelledby="q-title">
        <div id="q-title" className="text-sm font-semibold text-accent">שאלה {index + 1} מתוך {questions.length}</div>
        <div className="mt-3 text-[17px] leading-relaxed text-ink"><Md text={q.stem} /></div>
        <fieldset className="mt-5" disabled={readOnly}>
          <legend className="sr-only">בחירת תשובה</legend>
          <ul className="flex flex-col gap-2.5">
            {q.options.map((o) => (
              <li key={o.key}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${optionClass(o.key)} ${readOnly ? "cursor-default" : ""}`}>
                  <input type="radio" name={`q-${q.id}`} className="sr-only" checked={q.chosenKey === o.key} onChange={() => choose(o.key)} />
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${q.chosenKey === o.key ? "border-ink bg-ink text-white" : "border-input text-subtle"}`}>{optionLetter(o.key)}</span>
                  <span className="pt-0.5 text-[16px] text-ink">{o.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {q.locked && !props.submitted && <p className="mt-3 text-[13px] text-muted">צפית בפתרון של שאלה זו, ולכן התשובה נעולה.</p>}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <button type="button" className={btn.secondary} onClick={() => go(index - 1)} disabled={index === 0}>שאלה קודמת</button>
          <button type="button" className={btn.dark} onClick={() => go(index + 1)} disabled={index === questions.length - 1}>שאלה הבאה</button>
          <span className="flex-1" />
          <button type="button" className={btn.soft} onClick={askSolution} disabled={busy || !solutionAllowed || !!solution} title={!solutionAllowed ? (props.solutionPolicy === "after_submit" ? "הפתרונות יוצגו אחרי ההגשה" : "בחרו תשובה לפני הצפייה בפתרון") : undefined}>
            צפה בפתרון
          </button>
        </div>
        <div className="mt-3">
          <button type="button" className="text-sm font-semibold text-accent underline-offset-4 hover:underline" onClick={() => { setHelpOpen((v) => !v); setHelpSent(null); }} aria-expanded={helpOpen}>
            צריכים עזרה?
          </button>
          {helpSent && <p className="mt-2 text-sm text-success-ink" role="status">{helpSent}</p>}
          {helpOpen && (
            <div className="mt-3 rounded-md border border-line bg-surface p-4">
              <label htmlFor="help-text" className="text-[15px] font-semibold text-ink">מה לא היה ברור בשאלה?</label>
              <textarea id="help-text" rows={4} value={helpText} onChange={(e) => setHelpText(e.target.value)} className="mt-2 w-full rounded-md border border-input bg-white p-3 text-[15px] outline-none focus:border-accent" placeholder="למשל: לא הבנתי למה צריך להכניס את ה-PV במינוס." />
              <p className="mt-1 text-xs text-muted">הפנייה נשלחת לצוות האקדמיה יחד עם פרטי השאלה {index + 1} והתשובה שבחרת. עונה לך אדם, לא מערכת אוטומטית.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className={btn.primary} onClick={sendHelp} disabled={busy || helpText.trim().length < 3}>שליחת הודעה</button>
                <button type="button" className={btn.ghost} onClick={() => setHelpOpen(false)}>ביטול</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {confirmSolution && (
        <div className="rounded-xl border border-warn bg-warn-soft p-4" role="alertdialog" aria-label="אישור צפייה בפתרון">
          <p className="text-[15px] text-ink">אחרי הצפייה בפתרון לא תוכלו לשנות את התשובה לשאלה זו{q.chosenKey ? "" : ", ושאלה בלי תשובה תיחשב כשגויה"}. להציג את הפתרון?</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btn.dark} onClick={openSolution} disabled={busy}>הצגת הפתרון</button>
            <button type="button" className={btn.secondary} onClick={() => setConfirmSolution(false)}>חזרה לשאלה</button>
          </div>
        </div>
      )}

      {solution && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line bg-white p-5">
            <div className="text-[15px] font-bold text-ink">התשובה הנכונה: {optionLetter(solution.correctKey)}</div>
            <div className="mt-2 text-[15px] text-body"><Md text={solution.explanation} /></div>
          </div>
          <SolutionTabs solution={solution} />
        </div>
      )}

      {error && <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-ink" role="alert">{error}</p>}

      {!props.submitted && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[15px] text-body">נענו {answered} מתוך {questions.length} שאלות. התשובות נשמרות אוטומטית.</div>
          {confirmSubmit ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink">{answered < questions.length ? `${questions.length - answered} שאלות ללא תשובה ייחשבו כשגויות. ` : ""}להגיש?</span>
              <button type="button" className={btn.primary} onClick={submit} disabled={busy}>כן, להגיש</button>
              <button type="button" className={btn.secondary} onClick={() => setConfirmSubmit(false)}>עוד לא</button>
            </div>
          ) : (
            <button type="button" className={btn.primary} onClick={() => setConfirmSubmit(true)} disabled={busy}>סיום והגשה</button>
          )}
        </div>
      )}
    </div>
  );
}
