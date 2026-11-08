/**
 * Automatic checks on an uploaded video file before it can be reviewed.
 * Pure functions over bytes so they run anywhere and are easy to test.
 */
export interface VideoFileChecks {
  passed: boolean;
  container: "mp4" | "webm" | "unknown";
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  issues: string[];
}

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const MIN_VIDEO_BYTES = 10 * 1024;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];

export function sniffContainer(bytes: Uint8Array): "mp4" | "webm" | "unknown" {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  return "unknown";
}

/** Walks MP4 boxes to read duration (mvhd) and the first video track size (tkhd). */
export function parseMp4Metadata(bytes: Uint8Array): { durationSeconds: number | null; width: number | null; height: number | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let duration: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      let header = 8;
      if (size === 1 && offset + 16 <= end) {
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) break;
      if (type === "mvhd") {
        const version = bytes[offset + header];
        if (version === 1) {
          const timescale = view.getUint32(offset + header + 20);
          const dur = Number(view.getBigUint64(offset + header + 24));
          duration = timescale ? dur / timescale : null;
        } else {
          const timescale = view.getUint32(offset + header + 12);
          const dur = view.getUint32(offset + header + 16);
          duration = timescale ? dur / timescale : null;
        }
      } else if (type === "tkhd" && width === null) {
        const version = bytes[offset + header];
        const base = offset + header + (version === 1 ? 88 : 76);
        if (base + 8 <= offset + size) {
          const w = view.getUint32(base) / 65536;
          const h = view.getUint32(base + 4) / 65536;
          if (w > 0 && h > 0) {
            width = Math.round(w);
            height = Math.round(h);
          }
        }
      } else if (containers.has(type)) {
        walk(offset + header, offset + size);
      }
      offset += size;
    }
  };
  walk(0, bytes.length);
  return { durationSeconds: duration, width, height };
}

export function checkVideoFile(input: { contentType: string; sizeBytes: number; firstBytes: Uint8Array; fullBytes?: Uint8Array | null }): VideoFileChecks {
  const issues: string[] = [];
  if (!ALLOWED_VIDEO_TYPES.includes(input.contentType)) issues.push(`סוג קובץ לא נתמך: ${input.contentType || "לא ידוע"} (נדרש MP4 או WebM)`);
  if (input.sizeBytes < MIN_VIDEO_BYTES) issues.push("הקובץ קטן מדי ואינו נראה כסרטון תקין");
  if (input.sizeBytes > MAX_VIDEO_BYTES) issues.push("הקובץ גדול מ-2GB");
  const container = sniffContainer(input.firstBytes);
  if (container === "unknown") issues.push("תוכן הקובץ אינו MP4 או WebM");
  if (container === "mp4" && input.contentType === "video/webm") issues.push("סוג הקובץ המוצהר אינו תואם לתוכן");
  if (container === "webm" && input.contentType === "video/mp4") issues.push("סוג הקובץ המוצהר אינו תואם לתוכן");

  let meta: { durationSeconds: number | null; width: number | null; height: number | null } = { durationSeconds: null, width: null, height: null };
  if (container === "mp4" && input.fullBytes) {
    meta = parseMp4Metadata(input.fullBytes);
    if (meta.durationSeconds !== null && meta.durationSeconds < 5) issues.push("הסרטון קצר מ-5 שניות");
    if (meta.durationSeconds !== null && meta.durationSeconds > 60 * 60) issues.push("הסרטון ארוך משעה");
  }
  return { passed: issues.length === 0, container, sizeBytes: input.sizeBytes, ...meta, issues };
}
