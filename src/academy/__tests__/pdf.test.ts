import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { lesson01 } from "../content/lessons/lesson-01";
import { buildLessonPdf, markdownBlocks, type LessonPdfSource } from "../pdf/lesson-documents";
import { renderPdf } from "../pdf/render";

const src: LessonPdfSource = {
  courseTitle: "מימון וסטטיסטיקה",
  lesson: { id: lesson01.id, number: 1, title: lesson01.title, summaryMd: lesson01.summary, topics: lesson01.topics },
  examples: lesson01.examples.map((e) => ({ title: e.title, problem: e.problem })),
  formulas: lesson01.formulas,
  homework: { title: "מטלה 1", version: 1, questions: lesson01.questions.map((q) => ({ id: q.id, version: 1, stem: q.stem, options: q.options })) },
};
const date = new Date("2026-11-10T00:00:00Z");

function hasPdftoppm() {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("Hebrew PDF engine", () => {
  it("renders every Lesson 1 document with embedded fonts, no missing glyphs, page numbers", async () => {
    for (const kind of ["questions_pdf", "formulas_pdf", "summary_pdf", "homework_pdf"] as const) {
      const out = await renderPdf(buildLessonPdf(kind, src, 1, date));
      expect(out.missingGlyphs, kind).toEqual([]);
      expect(out.pages).toBeGreaterThan(0);
      const doc = await PDFDocument.load(out.bytes);
      expect(doc.getPageCount()).toBe(out.pages);
      const flat = new TextDecoder("latin1").decode(await doc.save({ useObjectStreams: false }));
      expect(flat).toContain("/FontFile2"); // TrueType fonts are embedded
      expect(flat).toContain("Heebo");
    }
  });

  it("is deterministic: the same content and version give the same bytes", async () => {
    const a = await renderPdf(buildLessonPdf("questions_pdf", src, 3, date));
    const b = await renderPdf(buildLessonPdf("questions_pdf", src, 3, date));
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });

  it("numbers lesson questions in the same order as the lesson (and the video checkpoints)", () => {
    const spec = buildLessonPdf("questions_pdf", src, 1, date);
    const numbers = spec.blocks.filter((b) => b.type === "question").map((b) => (b.type === "question" ? b.number : 0));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lesson01.checkpoints?.map((c) => c.question)).toEqual(numbers);
  });

  it("does not print answers in the question booklet and labels the formula sheet as non-official", () => {
    const q = JSON.stringify(buildLessonPdf("questions_pdf", src, 1, date).blocks);
    expect(q).not.toContain("6,945.75 ₪ ="); // no worked solution
    const f = JSON.stringify(buildLessonPdf("formulas_pdf", src, 1, date).blocks);
    expect(f).toContain("אינו מחליף את דף הנוסחאות הרשמי");
  });

  it("parses the summary markdown subset", () => {
    expect(markdownBlocks("## כותרת\nשורה אחת\nשורה שתיים\n\n- פריט").map((b) => b.type)).toEqual(["heading", "paragraph", "bullet"]);
  });

  it.skipIf(!hasPdftoppm())("draws Hebrew right-to-left: in 'של' the tall lamed sits on the left", async () => {
    const out = await renderPdf({ title: "t", header: "", footerNote: "", date, blocks: [{ type: "paragraph", text: "של", size: 60 }] });
    const dir = mkdtempSync(path.join(tmpdir(), "pdf-"));
    writeFileSync(path.join(dir, "p.pdf"), out.bytes);
    execFileSync("pdftoppm", ["-r", "50", "-gray", "-f", "1", "-l", "1", path.join(dir, "p.pdf"), path.join(dir, "p")]);
    const file = readFileSync(path.join(dir, "p-1.pgm"));
    const header = file.subarray(0, 64).toString("latin1").split("\n");
    const [w, h] = header[1].split(" ").map(Number);
    const offset = header.slice(0, 3).join("\n").length + 1;
    const dark: Array<[number, number]> = [];
    for (let y = 40; y < Math.min(h, 140); y++) for (let x = 0; x < w; x++) if (file[offset + y * w + x] < 128) dark.push([y, x]);
    const xs = dark.map(([, x]) => x);
    const top = Math.min(...dark.map(([y]) => y));
    const topXs = dark.filter(([y]) => y <= top + 3).map(([, x]) => x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(Math.max(...topXs)).toBeLessThan(mid);
  });
});
