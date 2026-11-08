import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { newId, nowIso } from "../lib/ids";
import { parseJson } from "../lib/json";
import { getStorage } from "../storage";
import { checkVideoFile, MAX_VIDEO_BYTES, ALLOWED_VIDEO_TYPES, type VideoFileChecks } from "../storage/video-checks";
import { buildProductionPackage, findUnverifiedNumbers, VIDEO_CHECKLIST, type ProductionPackage } from "../notebook/production-package";
import { getNotebookProvider, type NotebookProvider } from "../notebook/provider";
import { getVideoProvider } from "../notebook/video-provider";
import { calculatorVerdict, getFactStatuses } from "./facts";
import type { LessonRow, QuestionRow, StoredCalculator, UnitRow } from "./types";
import type { LlmClient } from "../ai/client";
import * as z from "zod/v4";

export class StudioError extends Error {}

export type TargetType = "lesson" | "question";

export interface VideoAssetRow {
  id: string; target_type: TargetType; target_id: string; version: number; title: string; storage_key: string; content_type: string;
  size_bytes: number; duration_seconds: number | null; width: number | null; height: number | null; checks_json: string;
  status: "uploading" | "uploaded" | "review" | "approved" | "rejected" | "published" | "superseded";
  notebook_id: string | null; production_package_id: string | null; created_by: string | null; reviewed_by: string | null;
  review_note: string | null; created_at: string; updated_at: string;
}

export class VideoStudioService {
  constructor(private readonly db: SqlDb, private readonly notebooks: NotebookProvider = getNotebookProvider()) {}

  private async courseModel(): Promise<{ courseId: string; model: string }> {
    const row = await this.db.get<{ id: string; calculator_model: string }>("SELECT id, calculator_model FROM courses ORDER BY created_at LIMIT 1");
    return { courseId: row?.id ?? "", model: row?.calculator_model ?? "casio-fc-200v" };
  }

  /** Every lesson and question with its video, package, notebook and view status. */
  async listTargets() {
    const { model } = await this.courseModel();
    const facts = await getFactStatuses(this.db, model);
    const lessons = await this.db.all<LessonRow & { unit_title: string; unit_position: number }>(
      `SELECT l.*, u.title AS unit_title, u.position AS unit_position FROM lessons l JOIN units u ON u.id = l.unit_id
       WHERE l.status != 'draft' ORDER BY u.position, l.position`,
    );
    const questions = await this.db.all<QuestionRow>("SELECT * FROM questions WHERE status != 'rejected' ORDER BY lesson_id, position");
    const assets = await this.db.all<VideoAssetRow>("SELECT * FROM video_assets ORDER BY version DESC");
    const packages = await this.db.all<{ id: string; target_type: string; target_id: string; created_at: string; notebook_id: string | null }>(
      "SELECT id, target_type, target_id, created_at, notebook_id FROM production_packages ORDER BY created_at DESC",
    );
    const notebooks = await this.db.all<{ id: string; target_type: string; target_id: string; status: string; external_url: string | null }>(
      "SELECT id, target_type, target_id, status, external_url FROM notebooks ORDER BY created_at DESC",
    );
    const views = await this.db.all<{ video_asset_id: string; views: number; viewers: number; avg_seconds: number; completed: number }>(
      `SELECT video_asset_id, COUNT(*) AS views, COUNT(DISTINCT user_id) AS viewers, AVG(seconds_watched) AS avg_seconds, SUM(completed) AS completed
       FROM video_views GROUP BY video_asset_id`,
    );
    const viewsById = new Map(views.map((v) => [v.video_asset_id, v]));
    const summarize = (type: TargetType, id: string) => {
      const versions = assets.filter((a) => a.target_type === type && a.target_id === id);
      const published = versions.find((a) => a.status === "published") ?? null;
      const latest = versions[0] ?? null;
      const stats = published ? viewsById.get(published.id) ?? null : null;
      return {
        published: published ? { id: published.id, version: published.version } : null,
        latest: latest ? { id: latest.id, version: latest.version, status: latest.status } : null,
        versions: versions.length,
        package: packages.find((p) => p.target_type === type && p.target_id === id) ?? null,
        notebook: notebooks.find((n) => n.target_type === type && n.target_id === id) ?? null,
        stats: stats ? { views: Number(stats.views), viewers: Number(stats.viewers), avgSeconds: Math.round(Number(stats.avg_seconds)), completed: Number(stats.completed) } : null,
      };
    };
    return lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      unitTitle: lesson.unit_title,
      status: lesson.status,
      video: summarize("lesson", lesson.id),
      questions: questions
        .filter((q) => q.lesson_id === lesson.id)
        .map((q) => {
          const calc = parseJson<StoredCalculator | null>(q.calculator_json, null);
          return {
            id: q.id,
            stem: q.stem_md,
            status: q.status,
            hasCalculator: !!calc,
            calculatorVerified: calc ? calculatorVerdict(calc.sequence, facts).verified : false,
            video: summarize("question", q.id),
          };
        }),
    }));
  }

  async packageInputFor(targetType: TargetType, targetId: string) {
    const { model } = await this.courseModel();
    const facts = await getFactStatuses(this.db, model);
    const withVerdict = (calc: StoredCalculator | null) => (calc ? { ...calc, verified: calculatorVerdict(calc.sequence, facts).verified } : null);
    let lesson: LessonRow | null;
    let question: QuestionRow | null = null;
    if (targetType === "question") {
      question = await this.db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [targetId]);
      if (!question) throw new StudioError("שאלה לא נמצאה");
      lesson = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [question.lesson_id]);
    } else {
      lesson = await this.db.get<LessonRow>("SELECT * FROM lessons WHERE id = ?", [targetId]);
    }
    if (!lesson) throw new StudioError("שיעור לא נמצא");
    return {
      targetType,
      title: question ? `פתרון: ${question.stem_md.slice(0, 60)}…` : lesson.title,
      lessonTitle: lesson.title,
      lessonSummary: lesson.summary_md,
      formulas: parseJson(lesson.formulas_json, []),
      calculatorModel: model,
      question: question
        ? {
            id: question.id,
            stem: question.stem_md,
            options: parseJson(question.options_json, []),
            correctKey: question.correct_key,
            explanation: question.short_explanation_md,
            formulaSteps: parseJson(question.solution_steps_json, []),
            calculator: withVerdict(parseJson<StoredCalculator | null>(question.calculator_json, null)),
          }
        : undefined,
      examples: question
        ? undefined
        : parseJson<Array<{ title: string; problem_md: string; solution_md: string; calculator: StoredCalculator | null }>>(lesson.examples_json, []).map((e) => ({
            title: e.title,
            problem: e.problem_md,
            solution: e.solution_md,
            calculator: withVerdict(e.calculator),
          })),
    } as const;
  }

  /**
   * Creates a production package from verified content. With `llm`, Claude
   * rewrites the narration script; numbers that do not appear in the verified
   * sources are rejected and the template script is kept.
   */
  async createPackage(actor: User, targetType: TargetType, targetId: string, llm?: LlmClient) {
    const input = await this.packageInputFor(targetType, targetId);
    const pkg: ProductionPackage = buildProductionPackage(input);
    let generatedBy = "template";
    let warning: string | null = null;
    if (llm) {
      const schema = z.object({ script_md: z.string() });
      const sourcesText = pkg.sources.map((s) => s.content).join("\n\n");
      const result = await llm.structured({
        system:
          "You write narration scripts for short Hebrew exam-prep videos. Keep the exact section structure and order of the template. Never add numbers that are not in the sources. Never describe calculator key presses; the calculator segment is a separate rendered animation. Output Hebrew.",
        prompt: `Template script:\n${pkg.scriptMd}\n\nVerified sources:\n${sourcesText}\n\nRewrite the narration so it sounds natural when spoken, keeping every section heading.`,
        schema,
        effort: "medium",
      });
      const unverified = findUnverifiedNumbers(result.data.script_md, sourcesText + pkg.scriptMd);
      if (unverified.length) {
        warning = `התסריט של Claude כלל מספרים שאינם במקורות המאומתים (${unverified.join(", ")}), ולכן נשמר תסריט התבנית.`;
      } else {
        pkg.scriptMd = result.data.script_md;
        generatedBy = "claude";
      }
    }
    const id = newId("pkg");
    await this.db.run(
      `INSERT INTO production_packages (id, target_type, target_id, title, script_md, instructions_md, sources_md, checklist_json, generated_by, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,'ready',?)`,
      [id, targetType, targetId, pkg.title, pkg.scriptMd, pkg.instructionsMd, JSON.stringify(pkg.sources), JSON.stringify(pkg.checklist), generatedBy, actor.id],
    );
    return { id, warning, manualSteps: await getVideoProvider().request({ packageId: id, title: pkg.title, notebookUrl: null }) };
  }

  async getPackage(id: string) {
    const row = await this.db.get<{ id: string; target_type: TargetType; target_id: string; title: string; script_md: string; instructions_md: string; sources_md: string; checklist_json: string; generated_by: string; notebook_id: string | null; created_at: string }>(
      "SELECT * FROM production_packages WHERE id = ?",
      [id],
    );
    if (!row) return null;
    return { ...row, sources: parseJson<Array<{ title: string; content: string }>>(row.sources_md, []), checklist: parseJson<Array<{ key: string; label: string }>>(row.checklist_json, []) };
  }

  /** Prepares the NotebookLM notebook for a package (API when configured, otherwise a manual record). */
  async prepareNotebook(actor: User, packageId: string) {
    const pkg = await this.getPackage(packageId);
    if (!pkg) throw new StudioError("חבילת הפקה לא נמצאה");
    const id = newId("nb");
    const title = `ABD Academy | ${pkg.title}`.slice(0, 120);
    if (!this.notebooks.automatic) {
      await this.db.run("INSERT INTO notebooks (id, provider, title, target_type, target_id, status) VALUES (?,?,?,?,?,'manual')", [
        id, this.notebooks.name, title, pkg.target_type, pkg.target_id,
      ]);
      for (const source of pkg.sources) {
        await this.db.run("INSERT INTO notebook_sources (id, notebook_id, title, kind, content_md, status) VALUES (?,?,?,?,?,'pending')", [
          newId("nbs"), id, source.title, "text", source.content,
        ]);
      }
      await this.db.run("UPDATE production_packages SET notebook_id = ? WHERE id = ?", [id, packageId]);
      return { notebookId: id, mode: "manual" as const };
    }
    try {
      const created = await this.notebooks.createNotebook(title);
      await this.db.run(
        "INSERT INTO notebooks (id, provider, external_name, external_id, external_url, title, target_type, target_id, status) VALUES (?,?,?,?,?,?,?,?,'created')",
        [id, this.notebooks.name, created.externalName, created.externalId, created.url, title, pkg.target_type, pkg.target_id],
      );
      const sources = await this.notebooks.addSources(created.externalId, pkg.sources.map((s) => ({ title: s.title, kind: "text" as const, content: s.content })));
      for (const [i, source] of pkg.sources.entries()) {
        const result = sources[i];
        await this.db.run(
          "INSERT INTO notebook_sources (id, notebook_id, external_name, external_id, title, kind, content_md, status, status_raw, checked_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [newId("nbs"), id, result?.externalName ?? null, result?.externalId ?? null, source.title, "text", source.content, result?.status ?? "unknown", result?.statusRaw ?? null, nowIso()],
        );
      }
      await this.db.run("UPDATE notebooks SET status = 'sources_processing', updated_at = ? WHERE id = ?", [nowIso(), id]);
      await this.db.run("UPDATE production_packages SET notebook_id = ? WHERE id = ?", [id, packageId]);
      await this.audit(actor, "notebook.create", id, { packageId, external: created.externalName });
      return { notebookId: id, mode: "api" as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db.run(
        "INSERT OR IGNORE INTO notebooks (id, provider, title, target_type, target_id, status, error) VALUES (?,?,?,?,?,'error',?)",
        [id, this.notebooks.name, title, pkg.target_type, pkg.target_id, message],
      );
      await this.db.run("UPDATE notebooks SET status = 'error', error = ? WHERE id = ?", [message, id]);
      throw new StudioError(`יצירת המחברת נכשלה: ${message}`);
    }
  }

  async refreshNotebook(notebookId: string) {
    const notebook = await this.db.get<{ id: string; external_id: string | null; status: string }>("SELECT id, external_id, status FROM notebooks WHERE id = ?", [notebookId]);
    if (!notebook) throw new StudioError("מחברת לא נמצאה");
    if (!notebook.external_id || !this.notebooks.automatic) return this.getNotebook(notebookId);
    const sources = await this.db.all<{ id: string; external_id: string | null }>("SELECT id, external_id FROM notebook_sources WHERE notebook_id = ?", [notebookId]);
    for (const source of sources) {
      if (!source.external_id) continue;
      const status = await this.notebooks.getSourceStatus(notebook.external_id, source.external_id);
      await this.db.run("UPDATE notebook_sources SET status = ?, status_raw = ?, checked_at = ? WHERE id = ?", [status.status, status.statusRaw, nowIso(), source.id]);
    }
    const states = await this.db.all<{ status: string }>("SELECT status FROM notebook_sources WHERE notebook_id = ?", [notebookId]);
    const overall = states.some((s) => s.status === "error") ? "error" : states.every((s) => s.status === "ready") ? "ready" : "sources_processing";
    await this.db.run("UPDATE notebooks SET status = ?, updated_at = ? WHERE id = ?", [overall, nowIso(), notebookId]);
    return this.getNotebook(notebookId);
  }

  async getNotebook(notebookId: string) {
    const notebook = await this.db.get<{ id: string; provider: string; title: string; status: string; external_url: string | null; external_name: string | null; error: string | null; target_type: string; target_id: string }>(
      "SELECT * FROM notebooks WHERE id = ?",
      [notebookId],
    );
    if (!notebook) return null;
    const sources = await this.db.all<{ id: string; title: string; status: string; status_raw: string | null; content_md: string | null }>(
      "SELECT id, title, status, status_raw, content_md FROM notebook_sources WHERE notebook_id = ?",
      [notebookId],
    );
    return { ...notebook, sources };
  }

  async setNotebookUrl(actor: User, notebookId: string, url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new StudioError("קישור לא תקין");
    }
    if (parsed.protocol !== "https:" || !/notebooklm/.test(parsed.hostname)) throw new StudioError("יש להדביק קישור למחברת NotebookLM (https)");
    await this.db.run("UPDATE notebooks SET external_url = ?, status = CASE WHEN status = 'manual' THEN 'ready' ELSE status END, updated_at = ? WHERE id = ?", [
      parsed.toString(), nowIso(), notebookId,
    ]);
    await this.audit(actor, "notebook.link", notebookId, { url: parsed.toString() });
  }

  /** Starts an upload: creates the next version and returns where to send the bytes. */
  async initUpload(actor: User, input: { targetType: TargetType; targetId: string; fileName: string; contentType: string; size: number; packageId?: string | null }) {
    if (!ALLOWED_VIDEO_TYPES.includes(input.contentType)) throw new StudioError("ניתן להעלות רק MP4 או WebM");
    if (input.size > MAX_VIDEO_BYTES) throw new StudioError("הקובץ גדול מ-2GB");
    const exists =
      input.targetType === "lesson"
        ? await this.db.get("SELECT id FROM lessons WHERE id = ?", [input.targetId])
        : await this.db.get("SELECT id FROM questions WHERE id = ?", [input.targetId]);
    if (!exists) throw new StudioError("יעד הסרטון לא נמצא");
    const last = await this.db.get<{ v: number | null }>("SELECT MAX(version) AS v FROM video_assets WHERE target_type = ? AND target_id = ?", [input.targetType, input.targetId]);
    const version = Number(last?.v ?? 0) + 1;
    const id = newId("vid");
    const ext = input.contentType === "video/webm" ? "webm" : "mp4";
    const storageKey = `videos/${input.targetType}/${input.targetId}/v${version}-${id}.${ext}`;
    const pkg = input.packageId ? await this.getPackage(input.packageId) : null;
    await this.db.run(
      `INSERT INTO video_assets (id, target_type, target_id, version, title, storage_key, content_type, size_bytes, status, production_package_id, notebook_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,'uploading',?,?,?)`,
      [id, input.targetType, input.targetId, version, input.fileName.slice(0, 200), storageKey, input.contentType, input.size, pkg?.id ?? null, pkg?.notebook_id ?? null, actor.id],
    );
    const uploadUrl = await getStorage().presignedUpload(storageKey, input.contentType);
    return { assetId: id, version, uploadUrl, serverUpload: uploadUrl ? null : `/api/academy/admin/videos/${id}/file` };
  }

  async storeUploadedBytes(assetId: string, data: Uint8Array) {
    const asset = await this.getAsset(assetId);
    if (asset.status !== "uploading") throw new StudioError("הקובץ כבר הועלה לגרסה זו");
    await getStorage().put(asset.storage_key, data, asset.content_type);
  }

  /** Runs the automatic file checks and moves the version to review (or rejects it). */
  async completeUpload(actor: User, assetId: string): Promise<VideoFileChecks> {
    const asset = await this.getAsset(assetId);
    if (asset.status !== "uploading") throw new StudioError("הגרסה אינה ממתינה להעלאה");
    const storage = getStorage();
    const head = await storage.head(asset.storage_key, 64 * 1024);
    if (!head) throw new StudioError("הקובץ לא נמצא באחסון");
    const full = head.size <= 300 * 1024 * 1024 ? await storage.read(asset.storage_key) : null;
    const checks = checkVideoFile({ contentType: asset.content_type, sizeBytes: head.size, firstBytes: head.firstBytes, fullBytes: full });
    await this.db.run(
      `UPDATE video_assets SET size_bytes = ?, duration_seconds = ?, width = ?, height = ?, checks_json = ?, status = ?, review_note = ?, updated_at = ? WHERE id = ?`,
      [
        head.size, checks.durationSeconds === null ? null : Math.round(checks.durationSeconds), checks.width, checks.height,
        JSON.stringify({ file: checks }), checks.passed ? "review" : "rejected", checks.passed ? null : `בדיקות קובץ נכשלו: ${checks.issues.join("; ")}`,
        nowIso(), assetId,
      ],
    );
    await this.audit(actor, "video.upload", assetId, { passed: checks.passed, issues: checks.issues });
    return checks;
  }

  async getAsset(assetId: string): Promise<VideoAssetRow> {
    const asset = await this.db.get<VideoAssetRow>("SELECT * FROM video_assets WHERE id = ?", [assetId]);
    if (!asset) throw new StudioError("גרסת סרטון לא נמצאה");
    return asset;
  }

  async versions(targetType: TargetType, targetId: string) {
    return this.db.all<VideoAssetRow & { creator: string | null; reviewer: string | null }>(
      `SELECT a.*, c.email AS creator, r.email AS reviewer FROM video_assets a
       LEFT JOIN users c ON c.id = a.created_by LEFT JOIN users r ON r.id = a.reviewed_by
       WHERE a.target_type = ? AND a.target_id = ? ORDER BY a.version DESC`,
      [targetType, targetId],
    );
  }

  /**
   * Academic + calculator-sequence review. Approval needs every checklist item,
   * passed file checks and, for a calculation question, a fully verified
   * calculator sequence (the rendered segment must come from it).
   */
  async review(reviewer: User, assetId: string, action: "approve" | "reject", checklist: Record<string, boolean>, note: string) {
    const asset = await this.getAsset(assetId);
    if (asset.status !== "review") throw new StudioError("הגרסה אינה ממתינה לאישור");
    const existing = parseJson<{ file?: VideoFileChecks }>(asset.checks_json, {});
    if (action === "approve") {
      if (!existing.file?.passed) throw new StudioError("בדיקות הקובץ לא עברו");
      const missing = VIDEO_CHECKLIST.filter((item) => !checklist[item.key]);
      if (missing.length) throw new StudioError(`יש לאשר את כל סעיפי הבדיקה: ${missing.map((m) => m.label).join("; ")}`);
      if (asset.target_type === "question") {
        const q = await this.db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", [asset.target_id]);
        const calc = parseJson<StoredCalculator | null>(q?.calculator_json, null);
        if (calc) {
          const { model } = await this.courseModel();
          const verdict = calculatorVerdict(calc.sequence, await getFactStatuses(this.db, model));
          if (!verdict.verified) throw new StudioError("לא ניתן לאשר סרטון פתרון לפני שרצף המחשבון של השאלה מאומת");
        }
      }
    } else if (!note.trim()) {
      throw new StudioError("יש לפרט את סיבת הדחייה");
    }
    await this.db.run("UPDATE video_assets SET status = ?, checks_json = ?, reviewed_by = ?, review_note = ?, updated_at = ? WHERE id = ?", [
      action === "approve" ? "approved" : "rejected",
      JSON.stringify({ ...existing, review: { checklist, at: nowIso() } }),
      reviewer.id, note.trim() || null, nowIso(), assetId,
    ]);
    await this.db.run("INSERT INTO content_reviews (id, target_type, target_id, action, note, reviewer_id) VALUES (?,?,?,?,?,?)", [
      newId("rev"), "video", assetId, action, note.trim() || null, reviewer.id,
    ]);
  }

  /** Publishes an approved version to its lesson/question; the previous published version becomes superseded. */
  async publish(actor: User, assetId: string) {
    const asset = await this.getAsset(assetId);
    if (asset.status !== "approved") throw new StudioError("ניתן לפרסם רק גרסה מאושרת");
    await this.db.batch([
      { sql: "UPDATE video_assets SET status = 'superseded', updated_at = ? WHERE target_type = ? AND target_id = ? AND status = 'published'", params: [nowIso(), asset.target_type, asset.target_id] },
      { sql: "UPDATE video_assets SET status = 'published', updated_at = ? WHERE id = ?", params: [nowIso(), assetId] },
      asset.target_type === "lesson"
        ? { sql: "UPDATE lessons SET video_asset_id = ? WHERE id = ?", params: [assetId, asset.target_id] }
        : { sql: "UPDATE questions SET solution_video_asset_id = ? WHERE id = ?", params: [assetId, asset.target_id] },
    ]);
    await this.audit(actor, "video.publish", assetId, { target: `${asset.target_type}:${asset.target_id}`, version: asset.version });
  }

  /** Links an already published question video to another question (same solution). */
  async linkToQuestion(actor: User, assetId: string, questionId: string) {
    const asset = await this.getAsset(assetId);
    if (asset.status !== "published" || asset.target_type !== "question") throw new StudioError("ניתן לקשר רק סרטון פתרון שפורסם");
    const q = await this.db.get("SELECT id FROM questions WHERE id = ?", [questionId]);
    if (!q) throw new StudioError("שאלה לא נמצאה");
    await this.db.run("UPDATE questions SET solution_video_asset_id = ? WHERE id = ?", [assetId, questionId]);
    await this.audit(actor, "video.link", assetId, { questionId });
  }

  async unpublish(actor: User, assetId: string) {
    const asset = await this.getAsset(assetId);
    if (asset.status !== "published") throw new StudioError("הגרסה אינה מפורסמת");
    await this.db.batch([
      { sql: "UPDATE video_assets SET status = 'approved', updated_at = ? WHERE id = ?", params: [nowIso(), assetId] },
      { sql: "UPDATE lessons SET video_asset_id = NULL WHERE video_asset_id = ?", params: [assetId] },
      { sql: "UPDATE questions SET solution_video_asset_id = NULL WHERE solution_video_asset_id = ?", params: [assetId] },
    ]);
    await this.audit(actor, "video.unpublish", assetId, {});
  }

  private async audit(actor: User, action: string, targetId: string, details: unknown) {
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), actor.id, action, "video", targetId, JSON.stringify(details),
    ]);
  }
}

export type { UnitRow };
