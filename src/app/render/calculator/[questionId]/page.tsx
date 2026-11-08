import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { getCurrentUser } from "@/academy/auth/session";
import { isStaff } from "@/academy/auth/service";
import { getDb } from "@/academy/db";
import { getCalculator } from "@/academy/calculator";
import { trace } from "@/academy/calculator/fc200v/simulator";
import { parseJson } from "@/academy/lib/json";
import { calculatorVerdict, getFactStatuses } from "@/academy/services/facts";
import type { QuestionRow, StoredCalculator } from "@/academy/services/types";
import CalculatorPlayer from "@/components/academy/CalculatorPlayer";

function tokenOk(token: string | undefined): boolean {
  const expected = process.env.ACADEMY_RENDER_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Deterministic calculator segment for a question's verified sequence (staff, or render token for recording). */
export default async function RenderCalculator({ params, searchParams }: {
  params: Promise<{ questionId: string }>; searchParams: Promise<{ autoplay?: string; frame?: string; token?: string }>;
}) {
  const { questionId } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!isStaff(user) && !tokenOk(query.token)) notFound();
  const db = await getDb();
  const q = await db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [questionId]);
  const calc = parseJson<StoredCalculator | null>(q?.calculator_json, null);
  if (!q || !calc) notFound();
  const course = await db.get<{ calculator_model: string }>("SELECT calculator_model FROM courses LIMIT 1");
  const model = course?.calculator_model ?? calc.sequence.model;
  const verdict = calculatorVerdict(calc.sequence, await getFactStatuses(db, model));
  const { frames, ok, error } = trace(calc.sequence);
  if (!ok) return <p className="p-8 text-rose-700">הסימולטור נכשל: {error}</p>;
  return (
    <CalculatorPlayer
      frames={frames}
      steps={calc.sequence.steps.map((s) => ({ explanation: s.explanation }))}
      title={`${calc.sequence.mode}: ${calc.sequence.result.display}`}
      mode={calc.sequence.mode}
      modelName={getCalculator(model).model.name}
      verified={verdict.verified}
      autoplay={query.autoplay === "1"}
      fixedFrame={query.frame !== undefined ? Math.max(0, Number(query.frame) || 0) : null}
    />
  );
}
