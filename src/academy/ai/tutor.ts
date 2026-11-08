import type Anthropic from "@anthropic-ai/sdk";
import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { isStaff } from "../auth/service";
import { getCalculator } from "../calculator";
import { newId, nowIso } from "../lib/ids";
import { parseJson } from "../lib/json";
import { getFactStatuses } from "../services/facts";
import { LearningService, AccessDeniedError } from "../services/learning";
import type { LessonRow, QuestionRow, UnitRow } from "../services/types";
import { getConfig } from "../config";
import type { ChatMessage, LlmClient } from "./client";
import { runCalculatorTool, runMathTool, TUTOR_TOOLS } from "./tools";

/**
 * Default teaching instructions for the AI tutor (developer-facing, English).
 * Student-facing output is always Hebrew.
 */
export const TUTOR_INSTRUCTIONS = `You are the private tutor of a Hebrew-language course that prepares candidates for the Israeli pension-advisor licensing exam in finance and statistics.

Language: always answer in clear, natural Hebrew. Keep calculator labels (CMPD, SOLVE, EXE, n, I%, PV, PMT, FV, P/Y, C/Y, nCr) in Latin characters as printed on the device.

Calculator-first policy (default for every numerical question):
1. Identify the right calculator mode and explain briefly why.
2. Show the input values and what each one means, including the cash-flow sign convention.
3. Give the exact key sequence and the expected display. Get it ONLY from the fc200v_sequence tool or from the verified sequences in the context. Never write key presses, menus or functions from memory, and never borrow them from other calculator models (HP 10bII, TI BA II Plus, Sharp, other Casio models).
4. Explain what the result means in the question's context, and one common input mistake.
5. Mention formulas only when needed for understanding, or when the student asks for a derivation or for the formula method.
If fc200v_sequence returns not_verified, or the calculation cannot be done appropriately on the FC-200V, say that a verified calculator method is not available for this case and explain with the formula. Do not invent calculator instructions.

When the student asks for a mathematical derivation or "how the formula works", give a formula-based explanation.

Combinatorics and probability: first explain the counting principle that decides the operation (does order matter? is repetition allowed? multiply stages or add cases?), then use nCr / nPr / x! through the fc200v_sequence tool when it confirms them.

Numbers: compute every number you present with evaluate_math or fc200v_sequence. Never present a number you did not compute or take from the verified context.

Scope: stay within the course material (time value of money, interest rates, annuities, cash flows, loans, statistics, probability and combinatorics). Be concise and encouraging. Do not give personal financial advice about the student's own money.`;

export interface TutorContext {
  lesson: LessonRow;
  unit: UnitRow;
  question: QuestionRow | null;
  revealSolution: boolean;
}

export class TutorService {
  constructor(private readonly db: SqlDb, private readonly llm: LlmClient) {}

  async loadContext(user: User, lessonId: string, questionId: string | null): Promise<TutorContext> {
    const lesson = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [lessonId]);
    if (!lesson) throw new AccessDeniedError("not_found");
    const learning = new LearningService(this.db);
    const view = await learning.getLessonView(user, lesson.slug);
    if (!view || !view.allowed) throw new AccessDeniedError(view && !view.allowed ? view.reason : "not_found");
    const unit = (await this.db.get<UnitRow>("SELECT * FROM units WHERE id = ?", [lesson.unit_id]))!;
    let question: QuestionRow | null = null;
    let revealSolution = false;
    if (questionId) {
      question = await this.db.get<QuestionRow>("SELECT * FROM questions WHERE id = ? AND lesson_id = ?", [questionId, lessonId]);
      if (!question || (question.status !== "approved" && !isStaff(user))) throw new AccessDeniedError("not_found");
      const answered = await this.db.get("SELECT id FROM question_attempts WHERE user_id = ? AND question_id = ? LIMIT 1", [user.id, questionId]);
      revealSolution = !!answered || isStaff(user);
    }
    return { lesson, unit, question, revealSolution };
  }

  async buildSystemPrompt(ctx: TutorContext): Promise<string> {
    const course = await this.db.get<{ title: string; calculator_model: string }>("SELECT title, calculator_model FROM courses WHERE id = ?", [ctx.unit.course_id]);
    const model = course?.calculator_model ?? "casio-fc-200v";
    const facts = await getFactStatuses(this.db, model);
    const calculator = getCalculator(model);
    const confirmed = calculator.model.facts.filter((f) => facts[f.key] === "confirmed");
    const parts = [
      TUTOR_INSTRUCTIONS,
      `\n## Course\n${course?.title ?? ""}. Reference calculator: ${calculator.model.name}.`,
      `\n## Confirmed calculator facts (the only device behaviour you may rely on)\n${confirmed.length ? confirmed.map((f) => `- ${f.statement}`).join("\n") : "- None confirmed yet. Do not give key presses; use formulas."}`,
      `\n## Current lesson\n${ctx.lesson.title}\n\n${ctx.lesson.summary_md}\n\nFormulas:\n${parseJson<Array<{ name: string; formula: string }>>(ctx.lesson.formulas_json, []).map((f) => `- ${f.name}: ${f.formula}`).join("\n")}`,
    ];
    if (ctx.question) {
      const options = parseJson<Array<{ key: string; text: string }>>(ctx.question.options_json, []);
      parts.push(`\n## Question the student is working on\n${ctx.question.stem_md}\n${options.map((o) => `(${o.key}) ${o.text}`).join("\n")}`);
      if (ctx.revealSolution) {
        const learning = new LearningService(this.db);
        const solution = await learning.buildSolution(ctx.question, ctx.unit.course_id);
        parts.push(`\nThe student has already answered. Verified correct answer: (${solution.correctKey}). ${solution.explanation}`);
        parts.push(`Verified formula steps:\n${solution.formulaSteps.map((s) => `- ${s.title}: ${s.body_md}`).join("\n")}`);
        if (solution.calculator) {
          const seq = solution.calculator.sequence;
          parts.push(
            `Verified ${solution.calculator.modelName} sequence (mode ${seq.mode}):\n${seq.steps
              .map((s, i) => `${i + 1}. [${s.keys.join(" ")}] ${s.explanation}${s.expectDisplay ? ` → ${s.expectDisplay}` : ""}`)
              .join("\n")}\nResult: ${seq.result.display}. ${solution.calculator.interpretation}`,
          );
        } else {
          parts.push(`No verified calculator sequence is available for this question (${solution.calculatorUnavailableReason}). Use the formula method.`);
        }
      } else {
        parts.push("\nThe student has NOT answered yet. Guide with hints and the method; do not reveal which option is correct.");
      }
    }
    return parts.join("\n");
  }

  async getThread(user: User, lessonId: string, questionId: string | null) {
    return this.db.get<{ id: string; messages_json: string }>(
      `SELECT id, messages_json FROM tutor_threads WHERE user_id = ? AND lesson_id = ? AND ${questionId ? "question_id = ?" : "question_id IS NULL"} ORDER BY updated_at DESC LIMIT 1`,
      questionId ? [user.id, lessonId, questionId] : [user.id, lessonId],
    );
  }

  /** Runs one tutor turn, streaming Hebrew text through onText. Tool calls are executed deterministically. */
  async ask(user: User, input: { lessonId: string; questionId: string | null; message: string }, onText: (delta: string) => void): Promise<string> {
    const message = input.message.trim().slice(0, 2000);
    if (!message) throw new Error("הודעה ריקה");
    const ctx = await this.loadContext(user, input.lessonId, input.questionId);
    const system = await this.buildSystemPrompt(ctx);
    const thread = await this.getThread(user, input.lessonId, input.questionId);
    const history = parseJson<Array<{ role: "user" | "assistant"; content: string; at: string }>>(thread?.messages_json, []).slice(-20);
    const messages: ChatMessage[] = [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];
    const model = (await this.db.get<{ calculator_model: string }>("SELECT calculator_model FROM courses WHERE id = ?", [ctx.unit.course_id]))?.calculator_model ?? "casio-fc-200v";
    const facts = await getFactStatuses(this.db, model);

    let answer = "";
    for (let turn = 0; turn < 6; turn++) {
      const result = await this.llm.streamTurn(
        { system, messages, tools: TUTOR_TOOLS, effort: getConfig().anthropic.tutorEffort },
        (delta) => {
          answer += delta;
          onText(delta);
        },
      );
      messages.push({ role: "assistant", content: result.content });
      if (result.stopReason !== "tool_use") break;
      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of result.content) {
        if (block.type !== "tool_use") continue;
        const output = block.name === "evaluate_math" ? runMathTool(block.input) : block.name === "fc200v_sequence" ? runCalculatorTool(block.input, model, facts) : { ok: false, error: "unknown tool" };
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output), is_error: !output.ok && !("status" in output) });
      }
      messages.push({ role: "user", content: toolResults });
      if (answer && !answer.endsWith("\n")) {
        answer += "\n\n";
        onText("\n\n");
      }
    }

    const stored = [...history, { role: "user" as const, content: message, at: nowIso() }, { role: "assistant" as const, content: answer.trim(), at: nowIso() }];
    if (thread) {
      await this.db.run("UPDATE tutor_threads SET messages_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(stored), nowIso(), thread.id]);
    } else {
      await this.db.run("INSERT INTO tutor_threads (id, user_id, lesson_id, question_id, messages_json) VALUES (?,?,?,?,?)", [
        newId("tt"), user.id, input.lessonId, input.questionId, JSON.stringify(stored),
      ]);
    }
    return answer.trim();
  }
}
