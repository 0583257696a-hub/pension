#!/usr/bin/env node
/**
 * Records the deterministic FC-200V segment of a question as a WebM file.
 *
 *   ACADEMY_RENDER_TOKEN=... node scripts/render-calculator-video.mjs <questionId> [baseUrl] [outDir]
 *
 * The app must run with the same ACADEMY_RENDER_TOKEN. Timing is fixed by the
 * player (press 700ms, hold 1800ms per step), so the same sequence always
 * produces the same video. Requires Playwright with Chromium.
 */
import { mkdirSync, renameSync } from "node:fs";
import path from "node:path";

const [questionId, baseUrl = "http://localhost:3000", outDir = ".data/renders"] = process.argv.slice(2);
const token = process.env.ACADEMY_RENDER_TOKEN;
if (!questionId || !token) {
  console.error("usage: ACADEMY_RENDER_TOKEN=... node scripts/render-calculator-video.mjs <questionId> [baseUrl] [outDir]");
  process.exit(1);
}

const { chromium } = await import("playwright");
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: outDir, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const url = `${baseUrl}/render/calculator/${encodeURIComponent(questionId)}?autoplay=1&token=${encodeURIComponent(token)}`;
await page.goto(url, { waitUntil: "networkidle" });
const timeline = await page.evaluate(() => window.__calcTimeline);
if (!timeline) throw new Error("render page did not expose a timeline (not found or not authorised?)");
await page.waitForFunction(() => document.body.dataset.calcDone === "1", null, { timeout: timeline.totalMs + 30_000 });
const video = page.video();
await context.close();
await browser.close();
const recorded = await video.path();
const target = path.join(outDir, `calculator-${questionId}.webm`);
renameSync(recorded, target);
console.log(`saved ${target} (${Math.round(timeline.totalMs / 1000)}s, ${timeline.frames} key presses)`);
