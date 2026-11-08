"use client";

import { useEffect, useRef, useState } from "react";
import Md from "./Md";
import { btn, input } from "./ui";

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
      <div className={`space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3 ${compact ? "max-h-80" : "max-h-[28rem]"}`}>
        {loaded && messages.length === 0 && (
          <p className="text-sm text-slate-500">שאלו את המורה על {questionId ? "השאלה" : "השיעור"}. התשובות מתחילות מהדרך במחשבון הפיננסי, וכל מספר מחושב במנוע המאומת של הקורס.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ms-8 bg-brand-600 text-white" : "me-8 border border-slate-200 bg-white"}`}>
            {m.role === "assistant" ? (m.content ? <Md text={m.content} /> : <span className="text-slate-400">המורה כותב…</span>) : m.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50" disabled={busy} onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="כתבו שאלה למורה…" maxLength={2000} disabled={busy} />
        <button type="submit" className={btn.primary} disabled={busy || !text.trim()}>
          שליחה
        </button>
      </form>
    </div>
  );
}
