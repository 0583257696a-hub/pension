import { describe, expect, it } from "vitest";
import { NotebookLmEnterpriseProvider, RefreshTokenProvider, StaticTokenProvider, mapSourceStatus } from "../notebook/provider";
import { buildProductionPackage, findUnverifiedNumbers } from "../notebook/production-package";
import { presignUrl } from "../storage/sigv4";
import { checkVideoFile, parseMp4Metadata, sniffContainer } from "../storage/video-checks";
import { tinyMp4 } from "./helpers";

function recordingFetch(responses: unknown[]) {
  const calls: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body;
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: typeof body === "string" ? JSON.parse(body) : body });
    return new Response(JSON.stringify(responses.shift() ?? {}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, impl };
}

describe("NotebookLM (Gemini Notebook Enterprise v1alpha) provider", () => {
  it("creates a notebook, adds text sources and reads source status with the documented endpoints", async () => {
    const { calls, impl } = recordingFetch([
      { name: "projects/123/locations/global/notebooks/nb1", notebookId: "nb1" },
      { sources: [{ name: "projects/123/locations/global/notebooks/nb1/sources/s1", sourceId: { id: "s1" }, title: "סיכום", settings: { status: "SOURCE_STATUS_PENDING" } }] },
      { settings: { status: "SOURCE_STATUS_COMPLETE" } },
    ]);
    const provider = new NotebookLmEnterpriseProvider({
      projectNumber: "123", location: "global", tokens: new StaticTokenProvider("tok"), fetchImpl: impl,
      webUrlTemplate: "https://notebooklm.cloud.google.com/{location}/notebook/{notebookId}?project={projectNumber}",
    });
    const nb = await provider.createNotebook("שיעור 1");
    expect(nb).toMatchObject({ externalId: "nb1", url: "https://notebooklm.cloud.google.com/global/notebook/nb1?project=123" });
    expect(calls[0].url).toBe("https://global-discoveryengine.googleapis.com/v1alpha/projects/123/locations/global/notebooks");
    expect(calls[0].body).toEqual({ title: "שיעור 1" });
    expect(calls[0].headers.get("authorization")).toBe("Bearer tok");

    const sources = await provider.addSources("nb1", [{ title: "סיכום", kind: "text", content: "תוכן" }]);
    expect(calls[1].url).toMatch(/\/notebooks\/nb1\/sources:batchCreate$/);
    expect(calls[1].body).toEqual({ userContents: [{ textContent: { sourceName: "סיכום", content: "תוכן" } }] });
    expect(sources[0]).toMatchObject({ externalId: "s1", status: "processing" });

    const status = await provider.getSourceStatus("nb1", "s1");
    expect(calls[2].method).toBe("GET");
    expect(calls[2].url).toMatch(/\/notebooks\/nb1\/sources\/s1$/);
    expect(status.status).toBe("ready");
  });

  it("uses the upload host path for files and the regional host when configured", async () => {
    const { calls, impl } = recordingFetch([{ sourceId: "f1" }]);
    const provider = new NotebookLmEnterpriseProvider({ projectNumber: "9", location: "us", endpointLocation: "discoveryengine.us.rep.googleapis.com", tokens: new StaticTokenProvider("t"), fetchImpl: impl });
    await provider.uploadFile("nb", "lesson.pdf", "application/pdf", new Uint8Array([1, 2, 3]));
    expect(calls[0].url).toBe("https://discoveryengine.us.rep.googleapis.com/upload/v1alpha/projects/9/locations/us/notebooks/nb/sources:uploadFile");
    expect(calls[0].headers.get("x-goog-upload-protocol")).toBe("raw");
    expect(calls[0].headers.get("x-goog-upload-file-name")).toBe("lesson.pdf");
  });

  it("refreshes OAuth tokens with the standard Google token endpoint", async () => {
    const { calls, impl } = recordingFetch([{ access_token: "fresh", expires_in: 3600 }]);
    const tokens = new RefreshTokenProvider({ clientId: "c", clientSecret: "s", refreshToken: "r" }, impl);
    expect(await tokens.getToken()).toBe("fresh");
    expect(await tokens.getToken()).toBe("fresh"); // cached
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
  });

  it("maps source states conservatively", () => {
    expect(mapSourceStatus("SOURCE_STATUS_COMPLETE")).toBe("ready");
    expect(mapSourceStatus("SOURCE_STATUS_ERROR")).toBe("error");
    expect(mapSourceStatus("SOURCE_STATUS_PENDING")).toBe("processing");
    expect(mapSourceStatus("SOMETHING_NEW")).toBe("unknown");
    expect(mapSourceStatus(null)).toBe("unknown");
  });
});

describe("production packages", () => {
  it("guards generated scripts against numbers that are not in the verified sources", () => {
    expect(findUnverifiedNumbers("התוצאה 16,288.95 ₪ אחרי 10 שנים", "FV = 16288.95, n = 10")).toEqual([]);
    expect(findUnverifiedNumbers("התוצאה 17,000 ₪", "FV = 16288.95")).toEqual(["17000"]);
  });

  it("falls back to the verified math solution when there is no verified calculator sequence", () => {
    const pkg = buildProductionPackage({
      targetType: "question", title: "t", lessonTitle: "l", lessonSummary: "s", formulas: [], calculatorModel: "casio-fc-200v",
      question: { id: "q", stem: "שאלה", options: [{ key: "a", text: "1" }], correctKey: "a", explanation: "e", formulaSteps: [{ title: "x", body: "y" }], calculator: null },
    });
    expect(pkg.scriptMd).toContain("אין רצף מחשבון מאומת");
    expect(pkg.sources.map((s) => s.content).join()).toContain("אין להזכיר מקשים");
  });
});

describe("R2 SigV4 presigning", () => {
  it("matches the AWS documented example for a presigned GET", () => {
    const url = presignUrl({
      method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      expiresSeconds: 86400, date: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  });
});

describe("video file checks", () => {
  it("accepts a valid MP4 and reads duration and size", () => {
    const bytes = tinyMp4(95);
    expect(sniffContainer(bytes)).toBe("mp4");
    expect(parseMp4Metadata(bytes)).toEqual({ durationSeconds: 95, width: 1280, height: 720 });
    expect(checkVideoFile({ contentType: "video/mp4", sizeBytes: bytes.length, firstBytes: bytes, fullBytes: bytes }).passed).toBe(true);
  });
  it("rejects wrong types, mismatched content and too-short videos", () => {
    const bytes = tinyMp4(2);
    expect(checkVideoFile({ contentType: "video/mp4", sizeBytes: bytes.length, firstBytes: bytes, fullBytes: bytes }).issues.join()).toContain("5 שניות");
    expect(checkVideoFile({ contentType: "video/webm", sizeBytes: bytes.length, firstBytes: bytes }).passed).toBe(false);
    expect(checkVideoFile({ contentType: "application/pdf", sizeBytes: 50_000, firstBytes: new Uint8Array(16) }).passed).toBe(false);
  });
});
