import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ContentAdminService } from "../content/../services/content-admin";
import { LearningService, AccessDeniedError } from "../services/learning";
import { VideoStudioService } from "../services/video-studio";
import { reviewFact } from "../services/facts";
import { EntitlementService } from "../billing/entitlements";
import { seedCourse } from "../content/seed";
import { COURSE_ID, financeStatisticsCourse } from "../content/course";
import { FC200V } from "../calculator/fc200v/model";
import { ManualNotebookProvider } from "../notebook/provider";
import { resetStorageForTests } from "../storage";
import { freshDb, makeUser, tinyMp4 } from "./helpers";

beforeAll(() => {
  process.env.ACADEMY_UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "academy-uploads-"));
  process.env.ACADEMY_STORAGE_DRIVER = "local";
  resetStorageForTests();
});

async function setup() {
  const db = await freshDb();
  const admin = await makeUser(db, "admin@example.com");
  const student = await makeUser(db, "student@example.com");
  const content = new ContentAdminService(db);
  const learning = new LearningService(db);
  return { db, admin, student, content, learning };
}

async function approveAndPublishUnit1(db: Awaited<ReturnType<typeof setup>>["db"], admin: Awaited<ReturnType<typeof setup>>["admin"]) {
  const content = new ContentAdminService(db);
  const unit1 = financeStatisticsCourse.units[0];
  for (const lesson of unit1.lessons) {
    for (const q of lesson.questions) await content.reviewQuestion(admin, q.id, "approve", "");
    await content.setLessonStatus(admin, lesson.id, "publish");
  }
}

describe("student journey, end to end, through the server-side services", () => {
  it("imports content in review status: nothing is visible to students before approval", async () => {
    const { student, learning, db } = await setup();
    const statuses = await db.all<{ status: string }>("SELECT DISTINCT status FROM questions");
    expect(statuses.map((s) => s.status)).toEqual(["review"]);
    const view = await learning.getLessonView(student, "compound-interest");
    expect(view?.allowed).toBe(false);
    if (view && !view.allowed) expect(view.reason).toBe("not_published");
  });

  it("refuses to publish a lesson with no approved questions and to approve a failed question", async () => {
    const { admin, content, db } = await setup();
    await expect(content.setLessonStatus(admin, "lsn_tvm_compound", "publish")).rejects.toThrow();
    await db.run("UPDATE questions SET verification_json = ? WHERE id = 'q_tvm_c_01'", [JSON.stringify({ status: "failed", checks: [] })]);
    await expect(content.reviewQuestion(admin, "q_tvm_c_01", "approve", "")).rejects.toThrow();
  });

  it("learns a lesson, answers, sees the formula fallback, then the calculator tab once facts are confirmed", async () => {
    const { db, admin, student, learning } = await setup();
    await approveAndPublishUnit1(db, admin);

    const view = await learning.getLessonView(student, "compound-interest");
    expect(view?.allowed).toBe(true);
    if (!view || !view.allowed) return;
    expect(view.practice.length).toBeGreaterThan(0);
    // The question payload sent before answering never contains the answer.
    expect(JSON.stringify(view.practice)).not.toContain("correct");
    expect(view.examples[0].calculator).toBeNull(); // facts still pending

    const wrong = await learning.answerQuestion(student, "q_tvm_c_01", "a");
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.solution.correctKey).toBe("b");
    expect(wrong.solution.calculator).toBeNull();
    expect(wrong.solution.calculatorUnavailableReason).toContain("ממתין לאישור");
    expect(wrong.solution.formulaSteps.length).toBeGreaterThan(0);
    expect(wrong.solution.video).toBeNull(); // no empty player

    for (const fact of FC200V.facts) await reviewFact(db, "casio-fc-200v", fact.key, "confirmed", "User's Guide, test", "", admin.id);
    const right = await learning.answerQuestion(student, "q_tvm_c_01", "b");
    expect(right.isCorrect).toBe(true);
    expect(right.solution.calculator?.sequence.mode).toBe("CMPD");
    expect(right.solution.calculator?.sequence.result.display).toBe("FV=16288.94627");
    const lessonAgain = await learning.getLessonView(student, "compound-interest");
    if (lessonAgain?.allowed) {
      expect(lessonAgain.examples[0].calculator).not.toBeNull();
      expect(lessonAgain.practice.find((q) => q.id === "q_tvm_c_01")?.hasCalculatorSolution).toBe(true);
      expect(lessonAgain.practice.find((q) => q.id === "q_tvm_c_05")?.hasCalculatorSolution).toBe(false); // conceptual question
    }

    // A rejected fact removes the calculator tab again (safe fallback).
    await reviewFact(db, "casio-fc-200v", "cmpd.set_menu", "rejected", "device check", "menu differs", admin.id);
    expect((await learning.getSolution(student, "q_tvm_c_01")).calculator).toBeNull();
  });

  it("saves progress: practice, quiz pass and completion, and gates paid lessons", async () => {
    const { db, admin, student, learning } = await setup();
    await approveAndPublishUnit1(db, admin);
    for (const id of ["q_tvm_c_01", "q_tvm_c_02", "q_tvm_c_05"]) await learning.answerQuestion(student, id, "a");
    let progress = await db.get<{ practice_done: number; completed: number }>("SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = 'lsn_tvm_compound'", [student.id]);
    expect(progress?.practice_done).toBe(1);
    expect(progress?.completed).toBe(0);

    const result = await learning.submitQuiz(student, "quiz_lsn_tvm_compound", { q_tvm_c_03: "b", q_tvm_c_04: "c" });
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    progress = await db.get("SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = 'lsn_tvm_compound'", [student.id]);
    expect(progress?.completed).toBe(1);

    // Paid lesson: locked, then open with a trial.
    const locked = await learning.getLessonView(student, "nominal-effective-rates");
    expect(locked?.allowed).toBe(false);
    await expect(learning.answerQuestion(student, "q_tvm_r_01", "c")).rejects.toBeInstanceOf(AccessDeniedError);
    await new EntitlementService(db).startTrial(student.id, COURSE_ID, 7);
    expect((await learning.getLessonView(student, "nominal-effective-rates"))?.allowed).toBe(true);

    const dash = await learning.getDashboard(student);
    expect(dash?.stats.completedLessons).toBe(1);
    expect(dash?.exams.map((e) => e.id)).toContain("sim_unit_tvm");
    const exam = await learning.getQuizView(student, "sim_unit_tvm");
    expect(exam?.quiz.timeLimitMinutes).toBe(30);
  });

  it("keeps student records when topics are reorganised or content is re-imported", async () => {
    const { db, admin, student, learning, content } = await setup();
    await approveAndPublishUnit1(db, admin);
    await learning.answerQuestion(student, "q_tvm_c_01", "b");
    await learning.submitQuiz(student, "quiz_lsn_tvm_compound", { q_tvm_c_03: "b", q_tvm_c_04: "c" });
    const before = await db.all("SELECT * FROM question_attempts WHERE user_id = ? ORDER BY id", [student.id]);

    await content.moveLesson(admin, "lsn_tvm_compound", "unit_exam_prep", 9);
    await seedCourse(db, financeStatisticsCourse, admin.id); // re-import moves it back and changes nothing else
    const after = await db.all("SELECT * FROM question_attempts WHERE user_id = ? ORDER BY id", [student.id]);
    expect(after).toEqual(before);
    const progress = await db.get<{ completed: number }>("SELECT completed FROM lesson_progress WHERE user_id = ? AND lesson_id = 'lsn_tvm_compound'", [student.id]);
    expect(progress?.completed).toBe(1);
    const q = await db.get<{ status: string }>("SELECT status FROM questions WHERE id = 'q_tvm_c_01'");
    expect(q?.status).toBe("approved"); // unchanged content keeps its approval
    const lesson = await db.get<{ unit_id: string; status: string }>("SELECT unit_id, status FROM lessons WHERE id = 'lsn_tvm_compound'");
    expect(lesson).toEqual({ unit_id: "unit_tvm", status: "published" });
  });

  it("runs the Video Studio workflow: package, manual notebook, upload, checks, review, publish, stats", async () => {
    const { db, admin, student, learning } = await setup();
    await approveAndPublishUnit1(db, admin);
    for (const fact of FC200V.facts) await reviewFact(db, "casio-fc-200v", fact.key, "confirmed", "User's Guide", "", admin.id);
    const studio = new VideoStudioService(db, new ManualNotebookProvider());

    const pkg = await studio.createPackage(admin, "question", "q_tvm_c_01");
    const stored = await studio.getPackage(pkg.id);
    expect(stored?.script_md).toContain("## 4. רצף המחשבון");
    expect(stored?.script_md.indexOf("איזו פונקציה במחשבון")).toBeLessThan(stored!.script_md.indexOf("רצף המחשבון ("));
    expect(stored?.instructions_md).toContain("Do NOT describe calculator key presses");
    const nb = await studio.prepareNotebook(admin, pkg.id);
    expect(nb.mode).toBe("manual");
    await expect(studio.setNotebookUrl(admin, nb.notebookId, "https://evil.example.com/x")).rejects.toThrow();
    await studio.setNotebookUrl(admin, nb.notebookId, "https://notebooklm.google.com/notebook/abc");

    // A broken file is rejected automatically.
    const bad = await studio.initUpload(admin, { targetType: "question", targetId: "q_tvm_c_01", fileName: "x.mp4", contentType: "video/mp4", size: 20000 });
    await studio.storeUploadedBytes(bad.assetId, new Uint8Array(20000));
    expect((await studio.completeUpload(admin, bad.assetId)).passed).toBe(false);

    const up = await studio.initUpload(admin, { targetType: "question", targetId: "q_tvm_c_01", fileName: "solution.mp4", contentType: "video/mp4", size: 20480, packageId: pkg.id });
    expect(up.version).toBe(2);
    await studio.storeUploadedBytes(up.assetId, tinyMp4(42));
    const checks = await studio.completeUpload(admin, up.assetId);
    expect(checks.passed).toBe(true);
    expect(Math.round(checks.durationSeconds!)).toBe(42);
    expect(checks.width).toBe(1280);

    await expect(studio.review(admin, up.assetId, "approve", { academic: true }, "")).rejects.toThrow(); // incomplete checklist
    await studio.review(admin, up.assetId, "approve", { academic: true, numbers: true, calculator: true, language: true, quality: true }, "");
    // Not visible to students before publication.
    expect((await learning.getSolution(admin, "q_tvm_c_01")).video).toBeNull();
    await studio.publish(admin, up.assetId);

    await learning.answerQuestion(student, "q_tvm_c_01", "b");
    const solution = await learning.getSolution(student, "q_tvm_c_01");
    expect(solution.video?.id).toBe(up.assetId);
    await learning.recordVideoProgress(student, up.assetId, 30, true);
    const targets = await studio.listTargets();
    const q = targets.flatMap((l) => l.questions).find((x) => x.id === "q_tvm_c_01")!;
    expect(q.video.published?.version).toBe(2);
    expect(q.video.stats?.views).toBe(1);
    expect((await studio.versions("question", "q_tvm_c_01")).map((v) => v.status)).toEqual(["published", "rejected"]);
  });

  it("blocks approving a calculation question's video while its calculator sequence is unverified", async () => {
    const { db, admin } = await setup();
    await approveAndPublishUnit1(db, admin);
    const studio = new VideoStudioService(db, new ManualNotebookProvider());
    const up = await studio.initUpload(admin, { targetType: "question", targetId: "q_tvm_r_01", fileName: "s.mp4", contentType: "video/mp4", size: 20480 });
    await studio.storeUploadedBytes(up.assetId, tinyMp4(30));
    await studio.completeUpload(admin, up.assetId);
    await expect(studio.review(admin, up.assetId, "approve", { academic: true, numbers: true, calculator: true, language: true, quality: true }, "")).rejects.toThrow(/רצף המחשבון/);
  });
});
