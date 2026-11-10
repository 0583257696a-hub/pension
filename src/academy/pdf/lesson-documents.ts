import { optionLabel, type Block, type PdfDocumentSpec } from "./render";

export type LessonPdfKind = "questions_pdf" | "formulas_pdf" | "homework_pdf" | "summary_pdf";

export const PDF_KIND_LABEL: Record<LessonPdfKind | "supplement_pdf", string> = {
  questions_pdf: "שאלות השיעור",
  formulas_pdf: "דף נוסחאות",
  homework_pdf: "חוברת המטלה",
  summary_pdf: "סיכום השיעור",
  supplement_pdf: "חומר נוסף",
};

export interface LessonPdfSource {
  courseTitle: string;
  lesson: { id: string; number: number | null; title: string; summaryMd: string; topics: string[] };
  examples: Array<{ title: string; problem: string }>;
  formulas: Array<{ name: string; formula: string; meaning: string }>;
  /** Published assignment questions, in assignment order (homework booklet only). */
  homework?: { title: string; version: number; questions: Array<{ id: string; version: number; stem: string; options: Array<{ key: string; text: string }> }> };
}

function lessonLabel(src: LessonPdfSource): string {
  return src.lesson.number ? `שיעור ${src.lesson.number}` : "שיעור";
}

/** "שאלה 3: כמה להפקיד היום" → "כמה להפקיד היום" (the number is printed by the question block). */
function exampleTag(title: string): string | undefined {
  const match = /^שאלה\s+\d+\s*[:：]\s*(.+)$/.exec(title.trim());
  return match ? match[1] : title.trim() || undefined;
}

/** Converts the lesson summary markdown subset (##, -, **bold**, paragraphs) to blocks. */
export function markdownBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("#")) {
      flush();
      blocks.push({ type: "heading", text: line.replace(/^#+\s*/, "") });
    } else if (/^[-*]\s+/.test(line)) {
      flush();
      blocks.push({ type: "bullet", text: line.replace(/^[-*]\s+/, "") });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

export function buildLessonPdf(kind: LessonPdfKind, src: LessonPdfSource, version: number, date: Date): PdfDocumentSpec {
  const label = lessonLabel(src);
  const base = { header: `${src.courseTitle} · ${src.lesson.title}`, date };
  switch (kind) {
    case "questions_pdf":
      return {
        ...base,
        title: `${PDF_KIND_LABEL.questions_pdf} — ${label}`,
        footerNote: `${label} · שאלות השיעור · גרסה ${version}`,
        blocks: [
          { type: "title", text: `${PDF_KIND_LABEL.questions_pdf} — ${label}`, subtitle: src.lesson.title },
          { type: "paragraph", text: "אלה השאלות שנפתור יחד בסרטון השיעור, באותו סדר ובאותם מספרים. כשהמרצה עוצר, נסו לפתור לבד במחשבון ורק אחר כך המשיכו לצפות.", muted: true },
          { type: "spacer", height: 6 },
          ...src.examples.map((e, i): Block => ({ type: "question", number: i + 1, text: e.problem, tag: exampleTag(e.title), workLines: 5 })),
          { type: "note", text: "התשובות והפתרונות המלאים מוצגים בסרטון השיעור." },
        ],
      };
    case "formulas_pdf":
      return {
        ...base,
        title: `${PDF_KIND_LABEL.formulas_pdf} — ${label}`,
        footerNote: `${label} · דף נוסחאות · גרסה ${version}`,
        blocks: [
          { type: "title", text: `${PDF_KIND_LABEL.formulas_pdf} — ${label}`, subtitle: src.lesson.title },
          ...src.formulas.map((f): Block => ({ type: "formulaEntry", name: f.name, formula: f.formula, meaning: f.meaning })),
          { type: "note", text: "הדף מסכם את נוסחאות השיעור לצורך לימוד. הוא אינו מחליף את דף הנוסחאות הרשמי שמחולק בבחינה." },
        ],
      };
    case "summary_pdf":
      return {
        ...base,
        title: `${PDF_KIND_LABEL.summary_pdf} — ${label}`,
        footerNote: `${label} · סיכום · גרסה ${version}`,
        blocks: [
          { type: "title", text: `${PDF_KIND_LABEL.summary_pdf} — ${label}`, subtitle: src.lesson.title },
          ...(src.lesson.topics.length ? [{ type: "paragraph", text: [{ text: "נושאים: ", bold: true }, { text: src.lesson.topics.join(" · ") }] } as Block] : []),
          ...markdownBlocks(src.lesson.summaryMd),
        ],
      };
    case "homework_pdf": {
      const hw = src.homework;
      if (!hw) throw new Error("אין מטלה מפורסמת לשיעור");
      return {
        ...base,
        title: `${hw.title} — ${label}`,
        footerNote: `${hw.title} · גרסת מטלה ${hw.version}`,
        blocks: [
          { type: "title", text: `${hw.title} — ${label}`, subtitle: `${hw.questions.length} שאלות · ${src.lesson.title}` },
          { type: "paragraph", text: "גרסה להדפסה של המטלה. את התשובות מסמנים ומגישים באתר, שם מוצגים גם הפתרונות וסרטוני ההסבר.", muted: true },
          { type: "spacer", height: 4 },
          ...hw.questions.map((q, i): Block => ({
            type: "question", number: i + 1, text: q.stem, options: q.options.map((o, j) => ({ label: optionLabel(j), text: o.text })), workLines: 2,
          })),
        ],
      };
    }
  }
}
