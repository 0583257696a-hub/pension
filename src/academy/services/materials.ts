import type { SqlDb } from "../db/types";
import type { User } from "../auth/types";
import { contentHash } from "../content/verify";
import { newId, nowIso } from "../lib/ids";
import { parseJson } from "../lib/json";
import { buildLessonPdf, PDF_KIND_LABEL, type LessonPdfKind, type LessonPdfSource } from "../pdf/lesson-documents";
import { renderPdf } from "../pdf/render";
import { getStorage } from "../storage";
import { loadSnapshots } from "./question-versions";
import type { LessonRow } from "./types";

export class MaterialsError extends Error {}

export interface LessonAssetRow {
  id: string; lesson_id: string; kind: LessonPdfKind | "supplement_pdf"; title: string; version: number; storage_key: string;
  content_type: string; size_bytes: number; content_hash: string; generated_by: "renderer" | "upload";
  status: "draft" | "published" | "superseded"; created_by: string | null; created_at: string; published_at: string | null;
}

/**
 * Lesson PDFs (spec §7.2, §15). Files are rendered from the lesson's current
 * content, stored as a draft version, and shown to students only after a
 * reviewer publishes them. Each file records the hash of the content it was
 * made from, so a later content change marks it as out of date.
 */
export class MaterialsService {
  constructor(private readonly db: SqlDb) {}

  private async source(lessonId: string): Promise<{ lesson: LessonRow & { number: number | null; topics_json: string }; src: LessonPdfSource }> {
    const lesson = await this.db.get<LessonRow & { number: number | null; topics_json: string }>("SELECT * FROM lessons WHERE id = ?", [lessonId]);
    if (!lesson) throw new MaterialsError("שיעור לא נמצא");
    const course = await this.db.get<{ title: string }>("SELECT c.title FROM courses c JOIN units u ON u.course_id = c.id WHERE u.id = ?", [lesson.unit_id]);
    const examples = parseJson<Array<{ title: string; problem_md: string }>>(lesson.examples_json, []);
    const assignment = await this.db.get<{ title: string; version: number; items_json: string | null }>(
      `SELECT a.title, a.version, v.items_json FROM assignments a LEFT JOIN assignment_versions v ON v.assignment_id = a.id AND v.version = a.version
       WHERE a.lesson_id = ? AND a.version > 0`,
      [lessonId],
    );
    let homework: LessonPdfSource["homework"];
    if (assignment?.items_json) {
      const items = JSON.parse(assignment.items_json) as Array<{ questionId: string; questionVersion: number }>;
      const snaps = await loadSnapshots(this.db, items);
      homework = {
        title: assignment.title,
        version: assignment.version,
        questions: items.map((i) => {
          const s = snaps.get(`${i.questionId}@${i.questionVersion}`)!;
          return { id: s.id, version: s.version, stem: s.stem, options: s.options.map(({ key, text }) => ({ key, text })) };
        }),
      };
    }
    return {
      lesson,
      src: {
        courseTitle: course?.title ?? "",
        lesson: { id: lesson.id, number: lesson.number, title: lesson.title, summaryMd: lesson.summary_md, topics: parseJson<string[]>(lesson.topics_json, []) },
        examples: examples.map((e) => ({ title: e.title, problem: e.problem_md })),
        formulas: parseJson(lesson.formulas_json, []),
        homework,
      },
    };
  }

  /** Hash of exactly the content a given PDF kind is made from. */
  private hashFor(kind: LessonPdfKind, src: LessonPdfSource): string {
    switch (kind) {
      case "questions_pdf": return contentHash({ kind, title: src.lesson.title, number: src.lesson.number, examples: src.examples });
      case "formulas_pdf": return contentHash({ kind, title: src.lesson.title, number: src.lesson.number, formulas: src.formulas });
      case "summary_pdf": return contentHash({ kind, title: src.lesson.title, number: src.lesson.number, summary: src.lesson.summaryMd, topics: src.lesson.topics });
      case "homework_pdf": return contentHash({ kind, homework: src.homework ?? null });
    }
  }

  async list(lessonId: string) {
    const rows = await this.db.all<LessonAssetRow>("SELECT * FROM lesson_assets WHERE lesson_id = ? ORDER BY kind, version DESC", [lessonId]);
    const { src } = await this.source(lessonId);
    return rows.map((r) => ({
      ...r,
      outdated: r.kind !== "supplement_pdf" && (r.kind !== "homework_pdf" || src.homework) ? r.content_hash !== this.hashFor(r.kind as LessonPdfKind, src) : false,
    }));
  }

  /** Renders one PDF from the current content and stores it as a draft version. Unchanged content reuses the existing file. */
  async generate(actor: User, lessonId: string, kind: LessonPdfKind) {
    const { lesson, src } = await this.source(lessonId);
    if (kind === "questions_pdf" && !src.examples.length) throw new MaterialsError("לשיעור אין שאלות שיעור");
    if (kind === "formulas_pdf" && !src.formulas.length) throw new MaterialsError("לשיעור אין נוסחאות");
    if (kind === "summary_pdf" && !src.lesson.summaryMd.trim()) throw new MaterialsError("לשיעור אין סיכום");
    if (kind === "homework_pdf" && !src.homework) throw new MaterialsError("אין מטלה מפורסמת לשיעור");
    const hash = this.hashFor(kind, src);
    const existing = await this.db.get<LessonAssetRow>(
      "SELECT * FROM lesson_assets WHERE lesson_id = ? AND kind = ? AND content_hash = ? AND status != 'superseded' ORDER BY version DESC LIMIT 1",
      [lessonId, kind, hash],
    );
    if (existing) return { asset: existing, reused: true, pages: null as number | null };
    const last = await this.db.get<{ v: number }>("SELECT MAX(version) AS v FROM lesson_assets WHERE lesson_id = ? AND kind = ?", [lessonId, kind]);
    const version = Number(last?.v ?? 0) + 1;
    const rendered = await renderPdf(buildLessonPdf(kind, src, version, new Date(lesson.updated_at || Date.now())));
    if (rendered.missingGlyphs.length) throw new MaterialsError(`חסרים תווים בגופן: ${rendered.missingGlyphs.join(" ")}`);
    const storage = await getStorage();
    const key = `lessons/${lessonId}/${kind}-v${version}-${hash.slice(0, 12)}.pdf`;
    await storage.put(key, rendered.bytes, "application/pdf");
    const id = newId("la");
    const label = PDF_KIND_LABEL[kind];
    await this.db.run(
      `INSERT INTO lesson_assets (id, lesson_id, kind, title, version, storage_key, size_bytes, content_hash, generated_by, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,'renderer','draft',?)`,
      [id, lessonId, kind, lesson.number ? `${label} — שיעור ${lesson.number}` : label, version, key, rendered.bytes.length, hash, actor.id],
    );
    await this.audit(actor, "material.generate", id, { lessonId, kind, version, pages: rendered.pages });
    return { asset: (await this.db.get<LessonAssetRow>("SELECT * FROM lesson_assets WHERE id = ?", [id]))!, reused: false, pages: rendered.pages };
  }

  /** Publishes a version and supersedes the previously published one of the same kind. */
  async publish(actor: User, assetId: string) {
    const asset = await this.db.get<LessonAssetRow>("SELECT * FROM lesson_assets WHERE id = ?", [assetId]);
    if (!asset) throw new MaterialsError("קובץ לא נמצא");
    const now = nowIso();
    await this.db.batch([
      {
        sql: "UPDATE lesson_assets SET status = 'superseded' WHERE lesson_id = ? AND kind = ? AND status = 'published' AND id != ? AND kind != 'supplement_pdf'",
        params: [asset.lesson_id, asset.kind, assetId],
      },
      { sql: "UPDATE lesson_assets SET status = 'published', published_at = ? WHERE id = ?", params: [now, assetId] },
    ]);
    await this.audit(actor, "material.publish", assetId, { lessonId: asset.lesson_id, kind: asset.kind, version: asset.version });
  }

  async unpublish(actor: User, assetId: string) {
    await this.db.run("UPDATE lesson_assets SET status = 'draft', published_at = NULL WHERE id = ?", [assetId]);
    await this.audit(actor, "material.unpublish", assetId, {});
  }

  /** Approved supplementary PDF uploaded by an editor. */
  async upload(actor: User, lessonId: string, title: string, bytes: Uint8Array) {
    if (bytes.length > 20 * 1024 * 1024) throw new MaterialsError("הקובץ גדול מ-20MB");
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    if (head !== "%PDF-") throw new MaterialsError("הקובץ אינו PDF");
    const hash = contentHash({ size: bytes.length, title, head: Array.from(bytes.slice(0, 2048)) });
    const last = await this.db.get<{ v: number }>("SELECT MAX(version) AS v FROM lesson_assets WHERE lesson_id = ? AND kind = 'supplement_pdf'", [lessonId]);
    const version = Number(last?.v ?? 0) + 1;
    const key = `lessons/${lessonId}/supplement-v${version}-${newId("f")}.pdf`;
    await (await getStorage()).put(key, bytes, "application/pdf");
    const id = newId("la");
    await this.db.run(
      `INSERT INTO lesson_assets (id, lesson_id, kind, title, version, storage_key, size_bytes, content_hash, generated_by, status, created_by)
       VALUES (?,?,'supplement_pdf',?,?,?,?,?,'upload','draft',?)`,
      [id, lessonId, title.trim() || "חומר נוסף", version, key, bytes.length, hash, actor.id],
    );
    await this.audit(actor, "material.upload", id, { lessonId, title });
    return id;
  }

  async get(assetId: string): Promise<LessonAssetRow | null> {
    return this.db.get<LessonAssetRow>("SELECT * FROM lesson_assets WHERE id = ?", [assetId]);
  }

  private async audit(actor: User, action: string, targetId: string, details: unknown) {
    await this.db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details_json) VALUES (?,?,?,?,?,?)", [
      newId("aud"), actor.id, action, "lesson_asset", targetId, JSON.stringify(details),
    ]);
  }
}
