"use client";

import { useEffect, useRef, useState } from "react";
import Md from "./Md";
import { IconArrowLeft } from "./icons";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS_QUESTION = ["איך פותרים את זה במחשבון?", "למה הסימן של PV שלילי?", "תסביר לי את הנוסחה מאחורי הפתרון"];
const SUGGESTIONS_LESSON = ["מתי משתמשים ב-CMPD ומתי ב-CNVR?", "תן לי שאלה דומה לתרגול", "מה ההבדל בין End ל-Begin?"];

/** Chat with the AI tutor about a lesson or a specific question. Streams the answer. */
export default function TutorChat({ lessonId, questionId = null, compact = false }: { lessonId: string; questionId?: string | null; compact?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams({ lessonId });
    if (questionId) params.set("questionId", questionId);
    fetch(`/api/academy/tutor?${params}`)
      .then((r) => r.json())
      .then((d: { messages?: Msg[] }) => setMessages(d.messages ?? []))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [lessonId, questionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setText("");
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/academy/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId, questionId, message }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "המורה AI אינו זמין כרגע");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch (error) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `⚠ ${error instanceof Error ? error.message : "שגיאה"}` };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  const suggestions = questionId ? SUGGESTIONS_QUESTION : SUGGESTIONS_LESSON;
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex flex-col gap-3 overflow-y-auto ${compact ? "max-h-[26rem]" : "max-h-[32rem]"}`}>
        {loaded && messages.length === 0 && (
          <div className="me-6 rounded-md border border-line bg-white px-4 py-3 text-sm leading-relaxed text-body">
            אני כאן כדי לעזור לך להבין את {questionId ? "השאלה" : "השיעור"}. התשובות מתחילות מהדרך במחשבון הפיננסי, וכל מספר מחושב במנוע המאומת של הקורס.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`rounded-md px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "ms-6 bg-dark text-white" : "me-6 border border-line bg-white text-body"}`}>
            {m.role === "assistant" ? (m.content ? <Md text={m.content} /> : <span className="text-faint">המורה כותב…</span>) : m.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" className="rounded-md border border-accent-line bg-white px-3 py-1.5 text-[13px] text-accent hover:bg-accent-tint" disabled={busy} onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2 rounded-md border border-input bg-white p-1.5 ps-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" value={text} onChange={(e) => setText(e.target.value)} placeholder="שאלו על השיעור…" maxLength={2000} disabled={busy} aria-label="שאלה למורה" />
        <button type="submit" aria-label="שליחה" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white disabled:bg-faint" disabled={busy || !text.trim()}>
          <IconArrowLeft size={16} />
        </button>
      </form>
    </div>
  );
}
