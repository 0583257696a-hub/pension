import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ContentAdminService } from "../services/content-admin";
import { LearningService } from "../services/learning";
import { AssignmentService } from "../services/assignments";
import { HelpService } from "../services/help";
import { MaterialsService } from "../services/materials";
import { VideoStudioService } from "../services/video-studio";
import { reviewFact } from "../services/facts";
import { EntitlementService } from "../billing/entitlements";
import { seedCourse } from "../content/seed";
import { COURSE_ID, financeStatisticsCourse } from "../content/course";
import { lesson01 } from "../content/lessons/lesson-01";
import { FC200V } from "../calculator/fc200v/model";
import { ManualNotebookProvider } from "../notebook/provider";
import { getStorage, resetStorageForTests } from "../storage";
import { freshDb, makeUser, tinyMp4 } from "./helpers";

beforeAll(() => {
  process.env.ACADEMY_UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "academy-uploads-"));
  process.env.ACADEMY_STORAGE_DRIVER = "local";
  resetStorageForTests();
});

const ASSIGNMENT_1 = "asg_lsn_tvm_compound";

async function setup() {
  const db = await freshDb();
  const admin = await makeUser(db, "admin@example.com");
  const student = await makeUser(db, "student@example.com");
  return { db, admin, student, content: new ContentAdminService(db), learning: new LearningService(db), assignments: new AssignmentService(db) };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** Reviewer approves Lesson 1 and its 20 questions, then publishes the lesson and Assignment 1. */
async function publishLesson1({ db, admin, content, assignments }: Ctx) {
  for (const q of lesson01.questions) await content.reviewQuestion(admin, q.id, "approve", "");
  await content.setLessonStatus(admin, lesson01.id, "publish");
  await assignments.publish(admin, ASSIGNMENT_1);
  void db;
}

describe("import and review gates", () => {
  it("imports content in review status with 14 chapters and numbered lessons; nothing is visible to students", async () => {
    const { db, student, learning } = await setup();
    expect((await db.all<{ status: string }>("SELECT DISTINCT status FROM questions")).map((s) => s.status)).toEqual(["review"]);
    expect(Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chapters"))?.n)).toBe(14);
    const syllabus = await learning.getSyllabus(student);
    expect(syllabus!.lessons.map((l) => l.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(syllabus!.lessons.find((l) => l.number === 9)!.chapters.map((c) => c.title)).toEqual(["קומבינטוריקה"]);
    const view = await learning.getLessonView(student, "compound-interest");
    expect(view?.allowed).toBe(false);
  });

  it("refuses to publish a lesson with no approved questions and to approve a failed question", async () => {
    const { admin, content, db } = await setup();
    await expect(content.setLessonStatus(admin, "lsn_tvm_compound", "publish")).rejects.toThrow();
    await db.run("UPDATE questions SET verification_json = ? WHERE id = 'q_tvm_c_01'", [JSON.stringify({ status: "failed", checks: [] })]);
    await expect(content.reviewQuestion(admin, "q_tvm_c_01", "approve", "")).rejects.toThrow();
  });

  it("will not publish an assignment until it has exactly its 20 approved, verified questions", async () => {
    const ctx = await setup();
    const { admin, content, assignments } = ctx;
    await expect(assignments.publish(admin, ASSIGNMENT_1)).rejects.toThrow(/כל השאלות אושרו/);
    for (const q of lesson01.questions.slice(0, 19)) await content.reviewQuestion(admin, q.id, "approve", "");
    await expect(assignments.publish(admin, ASSIGNMENT_1)).rejects.toThrow();
    await content.reviewQuestion(admin, lesson01.questions[19].id, "approve", "");
    const first = await assignments.publish(admin, ASSIGNMENT_1);
    expect(first).toEqual({ version: 1, unchanged: false });
    expect(await assignments.publish(admin, ASSIGNMENT_1)).toEqual({ version: 1, unchanged: true });
    await assignments.updateSettings(admin, ASSIGNMENT_1, { questionCount: 21 });
    await expect(assignments.publish(admin, ASSIGNMENT_1)).rejects.toThrow(/21/);
  });
});

describe("acceptance: the Lesson 1 vertical slice (spec §35)", () => {
  it("access, lesson, PDFs, video, 20 fixed questions, autosave, solution, help, grade, return later", async () => {
    const ctx = await setup();
    const { db, admin, student, learning, assignments, content } = ctx;
    await publishLesson1(ctx);
    // Lesson 1 is sold, not previewed, in this scenario.
    await content.setLessonAccess(admin, lesson01.id, "paid");

    // 4–5: numbered lessons; locked until access is granted (server-side).
    const before = await learning.getSyllabus(student);
    expect(before!.lessons.filter((l) => l.available).map((l) => l.number)).toEqual([1]);
    expect(before!.lessons[0].allowed).toBe(false);
    await expect(assignments.startOrResume(student, ASSIGNMENT_1)).rejects.toThrow();

    // 3: access granted by an authorised administrator action (verified purchase is covered in billing.test.ts).
    await new EntitlementService(db).grantManual(student.id, COURSE_ID, null, "חשבונית 2001", admin.id);

    // 7: PDFs are produced, published, and appear on the lesson page.
    const materials = new MaterialsService(db);
    const q = await materials.generate(admin, lesson01.id, "questions_pdf");
    const f = await materials.generate(admin, lesson01.id, "formulas_pdf");
    expect(q.pages).toBeGreaterThan(0);
    expect((await materials.generate(admin, lesson01.id, "questions_pdf")).reused).toBe(true);
    let view = await learning.getLessonView(student, "compound-interest");
    expect(view?.allowed && view.materials).toEqual([]); // drafts are invisible to students
    await materials.publish(admin, q.asset.id);
    await materials.publish(admin, f.asset.id);
    view = await learning.getLessonView(student, "compound-interest");
    if (!view?.allowed) throw new Error("lesson should be open");
    expect(view.materials.map((m) => m.kind)).toEqual(["questions_pdf", "formulas_pdf"]);
    const bytes = await (await getStorage()).read(q.asset.storage_key);
    expect(new TextDecoder().decode(bytes!.slice(0, 5))).toBe("%PDF-");
    expect(view.examples).toHaveLength(6);
    expect(view.checkpoints.map((c) => c.question)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view.assignment).toMatchObject({ id: ASSIGNMENT_1, number: 1, title: "מטלה 1", questionCount: 20, grade: null });

    // 8: the approved lesson video.
    const studio = new VideoStudioService(db, new ManualNotebookProvider());
    const up = await studio.initUpload(admin, { targetType: "lesson", targetId: lesson01.id, fileName: "lesson1.mp4", contentType: "video/mp4", size: 20480 });
    await studio.storeUploadedBytes(up.assetId, tinyMp4(600));
    expect((await studio.completeUpload(admin, up.assetId)).passed).toBe(true);
    await studio.review(admin, up.assetId, "approve", { academic: true, numbers: true, calculator: true, language: true, quality: true }, "");
    await studio.publish(admin, up.assetId);
    view = await learning.getLessonView(student, "compound-interest");
    expect(view?.allowed && view.video?.id).toBe(up.assetId);

    // 9–10: the fixed published questions, in order, without answers.
    const attemptId = await assignments.startOrResume(student, ASSIGNMENT_1);
    expect(await assignments.startOrResume(student, ASSIGNMENT_1)).toBe(attemptId);
    let attempt = await assignments.attemptView(student, attemptId);
    expect(attempt.questions.map((x) => x.id)).toEqual(lesson01.questions.map((x) => x.id));
    expect(attempt.questions.every((x) => x.options.length === 4 && x.correctKey === null)).toBe(true);
    expect(JSON.stringify(attempt)).not.toContain('"correct_key"');

    // A second student gets exactly the same questions in the same order.
    const other = await makeUser(db, "other@example.com");
    await new EntitlementService(db).grantManual(other.id, COURSE_ID, null, "חשבונית 2002", admin.id);
    const otherAttempt = await assignments.attemptView(other, await assignments.startOrResume(other, ASSIGNMENT_1));
    expect(otherAttempt.questions.map((x) => `${x.id}@${x.version}:${x.stem}`)).toEqual(attempt.questions.map((x) => `${x.id}@${x.version}:${x.stem}`));

    // 11–12: navigation and autosave. 16 correct, 4 wrong.
    const correctKey = new Map(lesson01.questions.map((x) => [x.id, x.correct]));
    const wrongKey = (id: string) => ["a", "b", "c", "d"].find((k) => k !== correctKey.get(id))!;
    const wrongIds = new Set(lesson01.questions.slice(16).map((x) => x.id));
    for (const [i, x] of lesson01.questions.entries()) {
      await assignments.saveAnswer(student, attemptId, x.id, wrongIds.has(x.id) ? wrongKey(x.id) : correctKey.get(x.id)!, i + 1);
    }
    await assignments.saveAnswer(student, attemptId, lesson01.questions[0].id, "a"); // change of mind…
    await assignments.saveAnswer(student, attemptId, lesson01.questions[0].id, correctKey.get(lesson01.questions[0].id)!); // …and back
    await expect(assignments.saveAnswer(student, attemptId, lesson01.questions[0].id, "z")).rejects.toThrow();
    await expect(assignments.saveAnswer(other, attemptId, lesson01.questions[0].id, "a")).rejects.toThrow();
    await assignments.setPosition(student, attemptId, 7);

    // 13–14: viewing an approved solution locks that answer; the solution video shows when published.
    const solution = await assignments.viewSolution(student, attemptId, lesson01.questions[1].id);
    expect(solution.correctKey).toBe(correctKey.get(lesson01.questions[1].id));
    expect(solution.formulaSteps.length).toBeGreaterThan(0);
    expect(solution.video).toBeNull();
    await expect(assignments.saveAnswer(student, attemptId, lesson01.questions[1].id, "a")).rejects.toThrow(/נעולה|לשנות/);

    // 15–16: help request carries the question context; staff reply is visible to the student.
    const help = new HelpService(db);
    const { id: helpId } = await help.create(student, { attemptId, questionId: lesson01.questions[2].id, message: "לא הבנתי למה צריך להכניס את ה-PV במינוס." });
    const req = await db.get<Record<string, unknown>>("SELECT * FROM help_requests WHERE id = ?", [helpId]);
    expect(req).toMatchObject({ user_id: student.id, course_id: COURSE_ID, lesson_id: lesson01.id, assignment_id: ASSIGNMENT_1, attempt_id: attemptId, question_id: lesson01.questions[2].id, question_version: 1, question_position: 3, status: "new" });
    await expect(help.create(other, { attemptId, questionId: lesson01.questions[2].id, message: "x".repeat(10) })).rejects.toThrow();
    expect((await help.inbox()).map((r) => r.id)).toContain(helpId);
    await help.staffReply(admin, helpId, "כי זה כסף שיוצא מאיתנו היום.");
    expect(await help.unreadCount(student)).toBe(1);
    const thread = await help.thread(student, helpId);
    expect(thread.messages.map((m) => m.author_kind)).toEqual(["student", "staff"]);
    expect(thread.request.status).toBe("answered");
    expect(await help.unreadCount(student)).toBe(0);

    // 20 (part 1): returning later restores answers and position.
    attempt = await assignments.attemptView(student, attemptId);
    expect(attempt.attempt.currentPosition).toBe(7);
    expect(attempt.questions.filter((x) => x.chosenKey).length).toBe(20);
    expect(attempt.questions[1].locked).toBe(true);

    // 17–19: submit, grade (16/20 = 80), saved.
    const results = await assignments.submit(student, attemptId);
    expect(results.summary).toMatchObject({ correct: 16, total: 20, score: 80, wrong: [17, 18, 19, 20] });
    const stored = await db.get<{ score: number; kind: string; status: string }>("SELECT score, kind, status FROM assignment_attempts WHERE id = ?", [attemptId]);
    expect(stored).toEqual({ score: 80, kind: "official", status: "submitted" });
    await expect(assignments.saveAnswer(student, attemptId, lesson01.questions[0].id, "a")).rejects.toThrow();
    expect((await assignments.submit(student, attemptId)).summary.score).toBe(80); // idempotent

    // 20 (part 2): the lesson shows the grade; the syllabus marks the lesson completed.
    view = await learning.getLessonView(student, "compound-interest");
    expect(view?.allowed && view.assignment?.grade).toMatchObject({ score: 80, correct: 16, total: 20 });
    expect((await learning.getSyllabus(student))!.lessons[0].state).toBe("completed");

    // A practice attempt never overwrites the official grade.
    const practiceId = await assignments.startOrResume(student, ASSIGNMENT_1, { newAttempt: true });
    expect(practiceId).not.toBe(attemptId);
    for (const x of lesson01.questions) await assignments.saveAnswer(student, practiceId, x.id, correctKey.get(x.id)!);
    const practice = await assignments.submit(student, practiceId);
    expect(practice.summary.score).toBe(100);
    expect(practice.summary.official?.score).toBe(80);
    const history = await assignments.gradeHistory(student);
    expect(history.map((h) => [h.kind, h.score])).toEqual([["official", 80], ["practice", 100]]);
    expect((await assignments.listForStudent(student, COURSE_ID))[0].official?.score).toBe(80);
  });

  it("keeps old grades on the old version when a published question is changed (spec §24)", async () => {
    const ctx = await setup();
    const { db, admin, student, assignments, content } = ctx;
    await publishLesson1(ctx);
    const attemptId = await assignments.startOrResume(student, ASSIGNMENT_1);
    const q1 = lesson01.questions[0];
    await assignments.saveAnswer(student, attemptId, q1.id, q1.correct);

    // An editor changes the answer key of question 1 after publication.
    const newKey = q1.correct === "a" ? "b" : "a";
    await db.run("UPDATE questions SET correct_key = ? WHERE id = ?", [newKey, q1.id]);
    const detail = await assignments.adminDetail(ASSIGNMENT_1);
    expect(detail!.items[0].changedSinceApproval).toBe(true);
    await expect(assignments.publish(admin, ASSIGNMENT_1)).rejects.toThrow(/שינויים/);
    await content.reviewQuestion(admin, q1.id, "approve", "תיקון מפתח");
    expect((await db.get<{ version: number }>("SELECT version FROM questions WHERE id = ?", [q1.id]))?.version).toBe(2);
    expect((await assignments.publish(admin, ASSIGNMENT_1)).version).toBe(2);

    // The student who started on version 1 is graded against version 1.
    const results = await assignments.submit(student, attemptId);
    expect(results.questions[0]).toMatchObject({ version: 1, isCorrect: true, correctKey: q1.correct });
    // A new student gets version 2.
    const late = await makeUser(db, "late@example.com");
    const lateView = await assignments.attemptView(late, await assignments.startOrResume(late, ASSIGNMENT_1));
    expect(lateView.questions[0].version).toBe(2);
  });

  it("enforces the solution policy on the server", async () => {
    const ctx = await setup();
    const { admin, student, assignments } = ctx;
    await publishLesson1(ctx);
    await assignments.updateSettings(admin, ASSIGNMENT_1, { solutionPolicy: "after_submit" });
    const attemptId = await assignments.startOrResume(student, ASSIGNMENT_1);
    await expect(assignments.viewSolution(student, attemptId, lesson01.questions[0].id)).rejects.toThrow(/אחרי הגשת/);
    await assignments.updateSettings(admin, ASSIGNMENT_1, { solutionPolicy: "after_answer" });
    await expect(assignments.viewSolution(student, attemptId, lesson01.questions[0].id)).rejects.toThrow(/בחרו תשובה/);
    await assignments.saveAnswer(student, attemptId, lesson01.questions[0].id, "a");
    await expect(assignments.viewSolution(student, attemptId, lesson01.questions[0].id)).resolves.toBeTruthy();
    await assignments.updateSettings(admin, ASSIGNMENT_1, { allowRetake: false });
    await assignments.submit(student, attemptId);
    await expect(assignments.startOrResume(student, ASSIGNMENT_1, { newAttempt: true })).rejects.toThrow(/פעם אחת/);
  });

  it("re-importing content never touches attempts, grades or approvals", async () => {
    const ctx = await setup();
    const { db, admin, student, assignments } = ctx;
    await publishLesson1(ctx);
    const attemptId = await assignments.startOrResume(student, ASSIGNMENT_1);
    await assignments.saveAnswer(student, attemptId, lesson01.questions[0].id, "b");
    await assignments.submit(student, attemptId);
    const before = await db.all("SELECT * FROM attempt_answers WHERE attempt_id = ? ORDER BY position", [attemptId]);
    await seedCourse(db, financeStatisticsCourse, admin.id);
    expect(await db.all("SELECT * FROM attempt_answers WHERE attempt_id = ? ORDER BY position", [attemptId])).toEqual(before);
    expect((await db.get<{ status: string }>("SELECT status FROM questions WHERE id = 'q_tvm_c_01'"))?.status).toBe("approved");
    expect((await db.get<{ status: string; version: number }>("SELECT status, version FROM assignments WHERE id = ?", [ASSIGNMENT_1]))).toEqual({ status: "published", version: 1 });
  });
});

describe("video studio", () => {
  it("runs the workflow: package, manual notebook, upload, checks, review, publish; the solution shows the video", async () => {
    const ctx = await setup();
    const { db, admin, student, assignments, learning } = ctx;
    await publishLesson1(ctx);
    for (const fact of FC200V.facts) await reviewFact(db, "casio-fc-200v", fact.key, "confirmed", "User's Guide", "", admin.id);
    const studio = new VideoStudioService(db, new ManualNotebookProvider());

    const pkg = await studio.createPackage(admin, "question", "q_tvm_c_01");
    const stored = await studio.getPackage(pkg.id);
    expect(stored?.script_md).toContain("## 4. רצף המחשבון");
    expect(stored?.instructions_md).toContain("Do NOT describe calculator key presses");
    const nb = await studio.prepareNotebook(admin, pkg.id);
    expect(nb.mode).toBe("manual");
    await expect(studio.setNotebookUrl(admin, nb.notebookId, "https://evil.example.com/x")).rejects.toThrow();
    await studio.setNotebookUrl(admin, nb.notebookId, "https://notebooklm.google.com/notebook/abc");

    const bad = await studio.initUpload(admin, { targetType: "question", targetId: "q_tvm_c_01", fileName: "x.mp4", contentType: "video/mp4", size: 20000 });
    await studio.storeUploadedBytes(bad.assetId, new Uint8Array(20000));
    expect((await studio.completeUpload(admin, bad.assetId)).passed).toBe(false);

    const up = await studio.initUpload(admin, { targetType: "question", targetId: "q_tvm_c_01", fileName: "solution.mp4", contentType: "video/mp4", size: 20480, packageId: pkg.id });
    expect(up.version).toBe(2);
    await studio.storeUploadedBytes(up.assetId, tinyMp4(42));
    const checks = await studio.completeUpload(admin, up.assetId);
    expect(checks.passed).toBe(true);
    expect(Math.round(checks.durationSeconds!)).toBe(42);
    await expect(studio.review(admin, up.assetId, "approve", { academic: true }, "")).rejects.toThrow();
    await studio.review(admin, up.assetId, "approve", { academic: true, numbers: true, calculator: true, language: true, quality: true }, "");

    const attemptId = await assignments.startOrResume(student, ASSIGNMENT_1);
    await assignments.saveAnswer(student, attemptId, "q_tvm_c_01", "b");
    expect((await assignments.viewSolution(student, attemptId, "q_tvm_c_01")).video).toBeNull(); // approved, not yet published
    await studio.publish(admin, up.assetId);
    const solution = await assignments.viewSolution(student, attemptId, "q_tvm_c_01");
    expect(solution.video?.id).toBe(up.assetId);
    expect(solution.calculator?.sequence.mode).toBe("CMPD"); // facts confirmed → calculator-first presentation
    await learning.recordVideoProgress(student, up.assetId, 30, true);
    const q = (await studio.listTargets()).flatMap((l) => l.questions).find((x) => x.id === "q_tvm_c_01")!;
    expect(q.video.published?.version).toBe(2);
    expect(q.video.stats?.views).toBe(1);
  });

  it("blocks approving a calculation question's video while its calculator sequence is unverified", async () => {
    const ctx = await setup();
    const { admin } = ctx;
    await publishLesson1(ctx);
    const studio = new VideoStudioService(ctx.db, new ManualNotebookProvider());
    const up = await studio.initUpload(admin, { targetType: "question", targetId: "q_tvm_c_07", fileName: "s.mp4", contentType: "video/mp4", size: 20480 });
    await studio.storeUploadedBytes(up.assetId, tinyMp4(30));
    await studio.completeUpload(admin, up.assetId);
    await expect(studio.review(admin, up.assetId, "approve", { academic: true, numbers: true, calculator: true, language: true, quality: true }, "")).rejects.toThrow(/רצף המחשבון/);
  });
});
