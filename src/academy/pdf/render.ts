import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import * as fonts from "./fonts.generated";

/**
 * Hebrew PDF engine (spec §15).
 *
 * Pure JavaScript, so the same code runs in Node and on Cloudflare Workers
 * (no headless browser). Text is laid out with the Unicode Bidirectional
 * Algorithm (bidi-js, UAX #9): paragraphs are RTL, numbers and Latin runs stay
 * LTR inside them, brackets are mirrored, and formulas are set as separate LTR
 * blocks. Heebo is embedded (subset) for Hebrew and Latin; glyphs Heebo lacks
 * (superscripts, Greek, math operators) fall back to a DejaVu Sans subset.
 */

export type Span = { text: string; bold?: boolean };

export type Block =
  | { type: "title"; text: string; subtitle?: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string | Span[]; muted?: boolean; size?: number }
  | { type: "bullet"; text: string | Span[] }
  | { type: "formula"; text: string }
  | { type: "formulaEntry"; name: string; formula: string; meaning: string }
  | { type: "question"; number: number; text: string; options?: Array<{ label: string; text: string }>; workLines?: number; tag?: string }
  | { type: "note"; text: string }
  | { type: "spacer"; height: number }
  | { type: "pageBreak" };

export interface PdfDocumentSpec {
  title: string;
  /** Running header, right side (e.g. course title). */
  header: string;
  /** Small line in the footer, e.g. "שיעור 1 · גרסה 3". */
  footerNote: string;
  /** Fixed for deterministic output: the same content gives the same bytes. */
  date: Date;
  blocks: Block[];
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { side: 56, top: 64, bottom: 62 };
const CONTENT_WIDTH = PAGE.width - MARGIN.side * 2;
const COLORS = {
  text: rgb(0x11 / 255, 0x18 / 255, 0x27 / 255),
  muted: rgb(0x66 / 255, 0x70 / 255, 0x85 / 255),
  accent: rgb(0x51 / 255, 0x45 / 255, 0xcd / 255),
  border: rgb(0xe5 / 255, 0xe7 / 255, 0xeb / 255),
  soft: rgb(0xf8 / 255, 0xfa / 255, 0xfc / 255),
};

const bidi = bidiFactory();
const HEBREW_LETTER = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let fontBytes: { regular: Uint8Array; bold: Uint8Array; mathRegular: Uint8Array; mathBold: Uint8Array } | null = null;
let coverage: { heebo: (cp: number) => boolean; math: (cp: number) => boolean } | null = null;

function loadFonts() {
  if (!fontBytes) {
    fontBytes = { regular: decode(fonts.regular), bold: decode(fonts.bold), mathRegular: decode(fonts.mathRegular), mathBold: decode(fonts.mathBold) };
    const heebo = fontkit.create(fontBytes.regular as unknown as Buffer) as unknown as { hasGlyphForCodePoint(cp: number): boolean };
    const math = fontkit.create(fontBytes.mathRegular as unknown as Buffer) as unknown as { hasGlyphForCodePoint(cp: number): boolean };
    coverage = { heebo: (cp) => heebo.hasGlyphForCodePoint(cp), math: (cp) => math.hasGlyphForCodePoint(cp) };
  }
  return { bytes: fontBytes, coverage: coverage! };
}

interface FontSet { regular: PDFFont; bold: PDFFont; mathRegular: PDFFont; mathBold: PDFFont }

interface Char { ch: string; bold: boolean }
interface LaidLine { runs: Array<{ text: string; font: PDFFont; width: number }>; width: number }

class Typesetter {
  readonly missing = new Set<string>();
  private widths = new Map<string, number>();
  constructor(private readonly fonts: FontSet, private readonly cov: { heebo: (cp: number) => boolean; math: (cp: number) => boolean }) {}

  fontFor(ch: string, bold: boolean): PDFFont {
    const cp = ch.codePointAt(0)!;
    if (ch === " " || this.cov.heebo(cp)) return bold ? this.fonts.bold : this.fonts.regular;
    if (this.cov.math(cp)) return bold ? this.fonts.mathBold : this.fonts.mathRegular;
    this.missing.add(ch);
    return bold ? this.fonts.bold : this.fonts.regular;
  }

  private width(ch: string, bold: boolean, size: number): number {
    const key = `${bold ? 1 : 0}${ch}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      const font = this.fontFor(ch, bold);
      const safe = this.missing.has(ch) ? "?" : ch;
      w = font.widthOfTextAtSize(safe, 1000);
      this.widths.set(key, w);
    }
    return (w * size) / 1000;
  }

  /** Breaks a paragraph into lines (logical order), then reorders each line visually with UAX #9. */
  layout(spans: Span[], size: number, maxWidth: number, direction: "rtl" | "ltr"): LaidLine[] {
    const chars: Char[] = [];
    for (const span of spans) for (const ch of Array.from(span.text.replace(/\s+/g, " "))) chars.push({ ch, bold: !!span.bold });
    while (chars.length && chars[0].ch === " ") chars.shift();
    while (chars.length && chars[chars.length - 1].ch === " ") chars.pop();
    if (!chars.length) return [];
    const text = chars.map((c) => c.ch).join("");
    // Array.from splits by code point; bidi-js indexes UTF-16 units. Our fonts are all BMP, so they coincide.
    const levels = bidi.getEmbeddingLevels(text, direction);
    const widths = chars.map((c) => this.width(c.ch, c.bold, size));

    const lines: Array<[number, number]> = [];
    let lineStart = 0;
    let lineWidth = 0;
    let lastSpace = -1;
    for (let i = 0; i < chars.length; i++) {
      if (chars[i].ch === " ") lastSpace = i;
      lineWidth += widths[i];
      if (lineWidth > maxWidth && i > lineStart) {
        const breakAt = lastSpace > lineStart ? lastSpace : i;
        const end = breakAt - 1;
        lines.push([lineStart, end]);
        lineStart = chars[breakAt].ch === " " ? breakAt + 1 : breakAt;
        lineWidth = 0;
        for (let j = lineStart; j <= i; j++) lineWidth += widths[j];
        lastSpace = -1;
      }
    }
    lines.push([lineStart, chars.length - 1]);

    return lines.map(([start, end]) => {
      const order: number[] = [];
      for (let i = start; i <= end; i++) order.push(i);
      for (const [s, e] of bidi.getReorderSegments(text, levels, start, end)) {
        const a = s - start;
        const b = e - start;
        const slice = order.slice(a, b + 1).reverse();
        order.splice(a, slice.length, ...slice);
      }
      const mirrored = bidi.getMirroredCharactersMap(text, levels, start, end);
      const runs: Array<{ text: string; font: PDFFont; width: number; hebrew: boolean }> = [];
      let width = 0;
      for (const index of order) {
        const c = chars[index];
        const ch = mirrored.get(index) ?? c.ch;
        const font = this.fontFor(ch, c.bold);
        const out = this.missing.has(ch) ? "?" : ch;
        const w = this.width(ch, c.bold, size);
        const hebrew = HEBREW_LETTER.test(ch);
        width += w;
        const last = runs[runs.length - 1];
        if (last && last.font === font && last.hebrew === hebrew) {
          last.text += out;
          last.width += w;
        } else runs.push({ text: out, font, width: w, hebrew });
      }
      // fontkit (inside pdf-lib) lays out Hebrew-script strings right-to-left by
      // itself, reversing them. The line is already in visual order, so each
      // Hebrew run is handed over reversed and comes out in visual order.
      return {
        runs: runs.map((r) => ({ text: r.hebrew ? Array.from(r.text).reverse().join("") : r.text, font: r.font, width: r.width })),
        width,
      };
    });
  }
}

function toSpans(input: string | Span[]): Span[] {
  if (Array.isArray(input)) return input;
  // Inline **bold** markers.
  const spans: Span[] = [];
  const parts = input.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) spans.push({ text: part.slice(2, -2), bold: true });
    else spans.push({ text: part });
  }
  return spans;
}

const HEBREW_OPTION_LABELS = ["א", "ב", "ג", "ד", "ה", "ו"];
export function optionLabel(index: number): string {
  return HEBREW_OPTION_LABELS[index] ?? String(index + 1);
}

export interface RenderedPdf {
  bytes: Uint8Array;
  pages: number;
  missingGlyphs: string[];
}

export async function renderPdf(spec: PdfDocumentSpec): Promise<RenderedPdf> {
  const { bytes, coverage: cov } = loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontSet: FontSet = {
    regular: await doc.embedFont(bytes.regular, { subset: true }),
    bold: await doc.embedFont(bytes.bold, { subset: true }),
    mathRegular: await doc.embedFont(bytes.mathRegular, { subset: true }),
    mathBold: await doc.embedFont(bytes.mathBold, { subset: true }),
  };
  const ts = new Typesetter(fontSet, cov);
  doc.setTitle(spec.title, { showInWindowTitleBar: true });
  doc.setLanguage("he-IL");
  doc.setAuthor("Pension AI Academy");
  doc.setCreator("Pension AI Academy PDF engine");
  doc.setProducer("pdf-lib");
  doc.setCreationDate(spec.date);
  doc.setModificationDate(spec.date);

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN.top;
  const right = PAGE.width - MARGIN.side;

  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN.top;
  };
  const ensure = (height: number) => {
    if (y - height < MARGIN.bottom) newPage();
  };

  const drawLines = (lines: LaidLine[], size: number, lineHeight: number, align: "right" | "center" | "left", color = COLORS.text, inset = 0, fixed = false) => {
    for (const line of lines) {
      if (!fixed) ensure(lineHeight);
      const x0 =
        align === "right" ? right - inset - line.width
          : align === "left" ? MARGIN.side + inset
            : MARGIN.side + (CONTENT_WIDTH - line.width) / 2;
      let x = x0;
      const baseline = y - size;
      for (const run of line.runs) {
        page.drawText(run.text, { x, y: baseline, size, font: run.font, color });
        x += run.width;
      }
      y -= lineHeight;
    }
  };

  const measure = (spans: Span[], size: number, width: number, dir: "rtl" | "ltr" = "rtl") => ts.layout(spans, size, width, dir);

  for (const block of spec.blocks) {
    switch (block.type) {
      case "title": {
        const lines = measure([{ text: block.text, bold: true }], 22, CONTENT_WIDTH);
        drawLines(lines, 22, 30, "right");
        if (block.subtitle) {
          y -= 2;
          drawLines(measure([{ text: block.subtitle }], 11.5, CONTENT_WIDTH), 11.5, 17, "right", COLORS.muted);
        }
        y -= 8;
        page.drawLine({ start: { x: MARGIN.side, y }, end: { x: right, y }, thickness: 1.2, color: COLORS.accent });
        y -= 18;
        break;
      }
      case "heading": {
        const lines = measure([{ text: block.text, bold: true }], 14, CONTENT_WIDTH);
        ensure(lines.length * 20 + 30);
        y -= 6;
        drawLines(lines, 14, 20, "right");
        y -= 4;
        break;
      }
      case "paragraph": {
        const size = block.size ?? 11;
        drawLines(measure(toSpans(block.text), size, CONTENT_WIDTH), size, size * 1.6, "right", block.muted ? COLORS.muted : COLORS.text);
        y -= 5;
        break;
      }
      case "bullet": {
        const lines = measure(toSpans(block.text), 11, CONTENT_WIDTH - 16);
        ensure(18);
        page.drawCircle({ x: right - 4, y: y - 11 * 0.62, size: 1.8, color: COLORS.accent });
        drawLines(lines, 11, 17.6, "right", COLORS.text, 14);
        y -= 2;
        break;
      }
      case "formula": {
        const lines = measure([{ text: block.text }], 13, CONTENT_WIDTH - 40, "ltr");
        const h = lines.length * 20 + 14;
        ensure(h);
        page.drawRectangle({ x: MARGIN.side, y: y - h, width: CONTENT_WIDTH, height: h, color: COLORS.soft, borderColor: COLORS.border, borderWidth: 0.8 });
        y -= 7;
        drawLines(lines, 13, 20, "center");
        y -= 13;
        break;
      }
      case "formulaEntry": {
        const name = measure([{ text: block.name, bold: true }], 11.5, CONTENT_WIDTH - 24);
        const formula = measure([{ text: block.formula }], 13, CONTENT_WIDTH - 40, "ltr");
        const meaning = measure([{ text: block.meaning }], 10, CONTENT_WIDTH - 24);
        const h = name.length * 17 + formula.length * 20 + meaning.length * 15 + 26;
        ensure(h);
        page.drawRectangle({ x: MARGIN.side, y: y - h, width: CONTENT_WIDTH, height: h, borderColor: COLORS.border, borderWidth: 0.8 });
        page.drawRectangle({ x: right - 3, y: y - h, width: 3, height: h, color: COLORS.accent });
        y -= 9;
        drawLines(name, 11.5, 17, "right", COLORS.text, 12);
        y -= 2;
        drawLines(formula, 13, 20, "center");
        drawLines(meaning, 10, 15, "right", COLORS.muted, 12);
        y -= 17;
        break;
      }
      case "question": {
        const label = `שאלה ${block.number}`;
        const head = measure([{ text: block.tag ? `${label} · ${block.tag}` : label, bold: true }], 11, CONTENT_WIDTH);
        const body = measure([{ text: block.text }], 11.5, CONTENT_WIDTH);
        const options = (block.options ?? []).map((o) => measure([{ text: `${o.label}. `, bold: true }, { text: o.text }], 11, CONTENT_WIDTH - 18));
        const optionsHeight = options.reduce((sum, o) => sum + o.length * 17 + 3, 0);
        const work = (block.workLines ?? 0) * 22;
        ensure(head.length * 17 + body.length * 18.5 + Math.min(optionsHeight, 120) + 12);
        drawLines(head, 11, 17, "right", COLORS.accent);
        drawLines(body, 11.5, 18.5, "right");
        y -= 3;
        for (const lines of options) {
          drawLines(lines, 11, 17, "right", COLORS.text, 14);
          y -= 3;
        }
        if (work) {
          ensure(Math.min(work, 120));
          const lines = block.workLines ?? 0;
          for (let i = 0; i < lines; i++) {
            ensure(22);
            y -= 22;
            page.drawLine({ start: { x: MARGIN.side, y }, end: { x: right, y }, thickness: 0.5, color: COLORS.border, dashArray: [2, 3] });
          }
        }
        y -= 16;
        break;
      }
      case "note": {
        const lines = measure([{ text: block.text }], 9.5, CONTENT_WIDTH - 24);
        const h = lines.length * 14.5 + 14;
        ensure(h);
        page.drawRectangle({ x: MARGIN.side, y: y - h, width: CONTENT_WIDTH, height: h, color: COLORS.soft });
        y -= 7;
        drawLines(lines, 9.5, 14.5, "right", COLORS.muted, 12);
        y -= 12;
        break;
      }
      case "spacer":
        y -= block.height;
        break;
      case "pageBreak":
        newPage();
        break;
    }
  }

  // Running header and "page X of Y" footer, drawn once the page count is known.
  const pages = doc.getPages();
  const headerLines = measure([{ text: spec.header }], 8.5, CONTENT_WIDTH / 2);
  const noteLines = measure([{ text: spec.footerNote }], 8, CONTENT_WIDTH / 2);
  pages.forEach((p, index) => {
    page = p;
    y = PAGE.height - 30;
    drawLines(headerLines.slice(0, 1), 8.5, 12, "right", COLORS.muted, 0, true);
    p.drawLine({ start: { x: MARGIN.side, y: PAGE.height - 44 }, end: { x: right, y: PAGE.height - 44 }, thickness: 0.5, color: COLORS.border });
    p.drawLine({ start: { x: MARGIN.side, y: 44 }, end: { x: right, y: 44 }, thickness: 0.5, color: COLORS.border });
    y = 38;
    drawLines(measure([{ text: `עמוד ${index + 1} מתוך ${pages.length}` }], 8.5, CONTENT_WIDTH), 8.5, 12, "center", COLORS.muted, 0, true);
    y = 38;
    drawLines(noteLines.slice(0, 1), 8, 12, "right", COLORS.muted, 0, true);
  });

  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, pages: pages.length, missingGlyphs: [...ts.missing] };
}
