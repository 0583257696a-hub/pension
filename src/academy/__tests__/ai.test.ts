import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { LlmClient, StreamTurnRequest } from "../ai/client";
import { runCalculatorTool, runMathTool } from "../ai/tools";
import { ContentEngine, addMaterial } from "../ai/content-engine";
import { ContentAdminService } from "../services/content-admin";
import { FC200V } from "../calculator/fc200v/model";
import { COURSE_ID } from "../content/course";
import { freshDb, makeUser } from "./helpers";

type Block = Anthropic.Beta.BetaContentBlock;

/** Fake Claude: replays scripted turns and records every request. */
class FakeLlm implements LlmClient {
  readonly model = "fake-claude";
  requests: StreamTurnRequest[] = [];
  constructor(private readonly turns: Array<{ text?: string; tools?: Array<{ name: string; input: unknown }> }>, private readonly structuredData?: unknown) {}
  async structured<T>() {
    return { data: this.structuredData as T, model: this.model, usage: null };
  }
  async streamTurn(request: StreamTurnRequest, onText: (d: string) => void) {
    this.requests.push(structuredClone(request));
    const turn = this.turns.shift() ?? { text: "סיום" };
    const content: Block[] = [];
    if (turn.text) {
      onText(turn.text);
      content.push({ type: "text", text: turn.text, citations: null } as Block);
    }
    for (const [i, t] of (turn.tools ?? []).entries()) content.push({ type: "tool_use", id: `tu_${this.requests.length}_${i}`, name: t.name, input: t.input } as Block);
    return { content, stopReason: turn.tools?.length ? "tool_use" : "end_turn", model: this.model };
  }
}

async function publishedUnit1() {
  const db = await freshDb();
  const admin = await makeUser(db, "admin@example.com");
  const student = await makeUser(db, "student@example.com");
  const content = new ContentAdminService(db);
  for (const id of ["q_tvm_c_01", "q_tvm_c_02", "q_tvm_c_03", "q_tvm_c_04", "q_tvm_c_05"]) await content.reviewQuestion(admin, id, "approve", "");
  await content.setLessonStatus(admin, "lsn_tvm_compound", "publish");
  return { db, admin, student };
}

describe("tutor tools", () => {
  it("computes numbers with the verified math engine", () => {
    expect(runMathTool({ expression: "fv_single(10000, 0.05, 10)" })).toMatchObject({ ok: true });
    expect(runMathTool({ expression: "require('fs')" }).ok).toBe(false);
  });

  it("returns key presses only when every calculator fact is confirmed", () => {
    const input = { mode: "CMPD", set: "End", n: 10, i: 5, pv: -10000, pmt: 0, py: 1, cy: 1, solve_for: "FV" };
    const pending = runCalculatorTool(input, "casio-fc-200v", {});
    expect(pending).toMatchObject({ ok: false, status: "not_verified" });
    const all = Object.fromEntries(FC200V.facts.map((f) => [f.key, "confirmed" as const]));
    const verified = runCalculatorTool(input, "casio-fc-200v", all);
    expect(verified).toMatchObject({ ok: true, final_display: "FV=16288.94627", mode: "CMPD" });
    expect(runCalculatorTool({ mode: "CMPD", n: 10, i: 5, py: 1, cy: 1, solve_for: "FV" }, "casio-fc-200v", all).ok).toBe(false); // missing values
    expect(runCalculatorTool({ mode: "COMP", comp_function: "nCr", a: 10, b: 3 }, "casio-fc-200v", all)).toMatchObject({ ok: true, final_display: "120" });
  });
});

describe("content engine", () => {
  it("requires authorised materials, verifies generated questions and applies them in review status only", async () => {
    const { db, admin } = await publishedUnit1();
    const generated = {
      questions: [
        {
          difficulty: 1, role: "practice", stem: "הפקדה של 1,000 ₪ ל-2 שנים בריבית 10%. מה הסכום?",
          options: [{ key: "a", text: "1,200", value: 1200 }, { key: "b", text: "1,210", value: 1210 }, { key: "c", text: "1,100", value: 1100 }, { key: "d", text: "1,331", value: 1331 }],
          correct: "b", explanation: "1,000 × 1.1² = 1,210", formula_steps: [{ title: "חישוב", body: "1,000 × 1.21" }],
          check_expression: "fv_single(1000, 0.1, 2)", tolerance: 0.01,
          calculator: { mode: "CMPD", set: "End", n: 2, i: 10, pv: -1000, pmt: 0, py: 1, cy: 1, solve_for: "FV" }, calculator_compare: "same",
          interpretation: "יתקבלו 1,210 ₪.", common_mistake: "ריבית פשוטה",
        },
        {
          difficulty: 2, role: "quiz", stem: "שאלה עם תשובה שגויה", options: [{ key: "a", text: "1", value: 1 }, { key: "b", text: "2", value: 2 }, { key: "c", text: "3", value: 3 }, { key: "d", text: "4", value: 4 }],
          correct: "a", explanation: "", formula_steps: [], check_expression: "nCr(4, 2)", tolerance: 0.01, calculator: null, calculator_compare: null, interpretation: null, common_mistake: null,
        },
      ],
    };
    const engine = new ContentEngine(db, new FakeLlm([], generated));
    await expect(engine.questions(admin, "lsn_tvm_compound", 2, [1, 2])).rejects.toThrow(/חומרי לימוד/);
    await addMaterial(db, admin, COURSE_ID, "syllabus", "סילבוס רשמי", "ערך הזמן של הכסף, ריבית דריבית…");
    const job = await engine.questions(admin, "lsn_tvm_compound", 2, [1, 2]);
    expect(job.output[0].report.status).toBe("verified");
    expect(job.output[1].report.status).toBe("failed"); // 4C2 = 6 is not option a
    await engine.apply(admin, job.jobId);
    const rows = await db.all<{ status: string; source: string; verification_json: string }>("SELECT status, source, verification_json FROM questions WHERE id LIKE 'q\\_%' ESCAPE '\\' AND source = 'ai' AND lesson_id = 'lsn_tvm_compound' AND id NOT LIKE 'q_tvm%'");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "review")).toBe(true);
    const failedId = (await db.get<{ id: string }>("SELECT id FROM questions WHERE stem_md = 'שאלה עם תשובה שגויה'"))!.id;
    await expect(new ContentAdminService(db).reviewQuestion(admin, failedId, "approve", "")).rejects.toThrow();
  });
});
