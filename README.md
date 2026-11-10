# AI Pension Academy — Finance & Statistics course

A single commercial course (Finance & Statistics for Israeli pension-advisor licensing), built end to end as a standalone Next.js app (served under `/academy`; `/` redirects there). Student-facing content is Hebrew; code and documentation are English.

Product direction: `docs/knowledge/Pension_AI_Academy_Master_Development_Prompt.md` (master spec) and `docs/knowledge/Pension_AI_Academy_Knowledge_v1.md`. The student side is a structured academy: numbered lessons, lesson PDFs above the video, a fixed 20-question assignment per lesson, approved solutions and short solution videos, grades, and a human "צריכים עזרה?" help form. **There is no student-facing AI**; Claude is used only in the admin content factory.

The course has 14 chapters in three parts (finance 1–6, statistics 7–11 with combinatorics as chapter 7, investments 12–14), taught in 16 numbered lessons. **Lesson 1** is the first complete vertical slice (6 lesson questions, 20 assignment questions, PDFs). Lessons 2–16 are drafts. Phase status: `docs/phase-1-report.md`.

## Quick start (local)

```bash
npm install
npm run dev            # http://localhost:3000/academy
npm test               # 99 tests, incl. the spec §35 acceptance test for Lesson 1
```

First run creates `.data/academy.sqlite` and imports the course **in review status** — nothing is visible to students yet. The first account you register becomes admin. Then:

1. `/academy/admin/calculator` — confirm the CASIO FC-200V facts against the official User's Guide or the device (see *Calculator-first* below). Until then solutions show the verified formula method only.
2. `/academy/admin/content` — open Lesson 1, read the automatic verification report, approve the 20 questions, publish the lesson.
3. `/academy/admin/assignments` — publish Assignment 1 (pre-publication checks must all pass; publishing freezes question versions).
4. `/academy/admin/materials` — generate the lesson PDFs, review them, publish. Set video chapter and checkpoint times after the lesson video is uploaded.
5. `/academy/admin/users` — grant access (with a reference) or sell through `/academy/pricing` once a payment provider is configured.
6. Register a second account to experience the student side.

## Architecture

| Area | Where | Notes |
|---|---|---|
| Data | `src/academy/db` | `SqlDb` interface in the SQLite dialect. Drivers: `node:sqlite` (dev/tests), Cloudflare **D1 via REST** (`d1-http`, works on Netlify/Node), D1 **binding** (when deployed on Cloudflare). Migrations in `db/migrations`, applied automatically; `npm run academy:d1-sql` exports them for `wrangler d1 migrations apply`. |
| Auth | `src/academy/auth` | PBKDF2-SHA256 passwords, opaque session tokens (only SHA-256 hashes stored), httpOnly SameSite=Lax cookie, same-origin check on writes. Roles: student / reviewer / admin. |
| Entitlements | `src/academy/billing/entitlements.ts` | The `entitlements` table is the only source of access. Created by a verified webhook, a 100% coupon, or an admin (with a reference). Server-side decisions (`decideLessonAccess`); "free" lessons are previews for signed-in users. |
| Payments | `src/academy/billing/service.ts`, `payment-provider.ts` | Plans (one-time / monthly / annual), coupons, orders, `payment_events` (each provider event applied once), amount check, refunds revoke access, reconciliation for lost webhooks and expired subscriptions. **No simulated payments**: provider `none` until a verified Israeli PSP is implemented. |
| Assignments | `src/academy/services/assignments.ts` | One fixed assignment per lesson (default 20). Publishing freezes approved question versions (`question_versions`); attempts pin them, so later edits never change old grades. Autosave per answer, resume position, solution policy, first submission = official grade, practice attempts after. |
| Help requests | `src/academy/services/help.ts` | "צריכים עזרה?" with server-attached context (course, lesson, assignment, question + version, attempt, chosen answer); admin inbox "פניות תלמידים", statuses, replies; no AI answers. |
| PDFs | `src/academy/pdf`, `services/materials.ts` | Pure-JS engine (pdf-lib + fontkit + bidi-js, runs on Workers): embedded Heebo + DejaVu math subset, UAX #9 bidi, LTR formula blocks, page numbers, deterministic output. Lesson questions, formula sheet, summary, homework booklet; versioned, published by a reviewer, served only to entitled users. |
| Math engine | `src/academy/math` | Independent finance/statistics formulas + a safe expression evaluator (whitelisted functions, no `eval`). |
| Calculator | `src/academy/calculator` | FC-200V model (keys + facts), plan→key-sequence builders, deterministic simulator, verdicts. |
| Content | `src/academy/content` | Course definition (Unit 1 + outlines), verification, idempotent import that never deletes rows. |
| Services | `src/academy/services` | Learning (numbered lessons, lesson page, progress), content review gates, Video Studio, calculator facts. |
| AI | `src/academy/ai` | Admin-only: Claude client (Opus 5.5 by default, server-side refusal fallbacks) and the content engine. The former student tutor was removed (spec §13); its stored threads are kept. |
| NotebookLM | `src/academy/notebook` | `NotebookProvider` (official v1alpha endpoints only), `VideoProvider` (manual today), production packages. |
| Storage | `src/academy/storage` | Local disk or Cloudflare R2 (SigV4 presigned URLs, no SDK); automatic video file checks. |
| UI | `src/app/academy`, `src/components/academy` | Design system "Pension AI Academy 1.0" (tokens in `src/app/academy/academy.css`, Heebo self-hosted under `public/fonts`, OFL). Route groups by frame: `(site)` public pages, `(app)` student app shell, `(player)` lesson player, `admin` dark admin shell. Calculator walkthrough with highlighted FC-200V keys driven by the simulator trace. Deterministic calculator render at `/render/calculator/[questionId]`. |

### Deploying to Cloudflare Workers

The app runs on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`); see `wrangler.jsonc` and `cloudflare/open-next.config.ts`. The OpenNext config is deliberately not in the project root: there, Wrangler would hand `wrangler deploy` over to `opennextjs-cloudflare deploy`, which skips the build step in `wrangler.jsonc`.

- **Bindings:** `ACADEMY_DB` (D1 database `pension-academy`) and `ACADEMY_MEDIA` (R2 bucket `pension-academy-media`). Wrangler creates both on the first deploy if they do not exist. On Cloudflare the app picks these bindings automatically; schema migrations and the course import run on the first request.
- **Workers Builds (Git integration):** the Worker in the dashboard must be named `pension` (same as `name` in `wrangler.jsonc`). Deploy command: `npx wrangler deploy` (the default). It runs the OpenNext build itself through `build.command` in `wrangler.jsonc`, so the dashboard build command may be empty or `npm run build`.
- **Manual deploy:** `npm run deploy`. Local preview in the Workers runtime with local D1/R2: `npm run preview`. OpenNext build only: `npm run build`. Plain Next.js build without the adapter: `npm run build:next`.
- **Secrets:** set `ANTHROPIC_API_KEY` (and optionally `NOTEBOOKLM_*`, `ACADEMY_RENDER_TOKEN`) with `npx wrangler secret put <NAME>` or in the dashboard under Settings → Variables and Secrets.
- **Limits:** video uploads go through the Worker on this setup, so a single file is limited by the plan's request body size (100 MB on Free and Pro). For larger files configure R2 S3 keys (`ACADEMY_STORAGE_DRIVER=r2`, `R2_*`) to upload directly to R2. Password hashing uses Web Crypto PBKDF2 at the Workers maximum of 100,000 iterations.

On other Node hosts (Netlify, Vercel, a VM) use D1 through its REST API (`ACADEMY_DB_DRIVER=d1-http`) and R2 through its S3 API.

## Calculator-first solutions

Every question has **one verified solution record** with several presentations: the calculator sequence (default tab *פתרון במחשבון פיננסי*), the formula steps (*פתרון באמצעות נוסחה*), an approved video (*סרטון הסבר*, only when published) and the AI tutor (*שאל את המורה AI*).

- Content and AI never write key presses. They write a **plan** (`CalcPlan`: mode + inputs + variable to solve). `calculator/fc200v/builders.ts` turns it into an exact sequence with Hebrew explanations, inputs, expected displays and common mistakes.
- `calculator/fc200v/simulator.ts` replays every sequence from **unknown memory** (a sequence that relies on leftover values fails) and checks every expected display. Content verification also cross-checks the simulator against the independent math engine and the correct option.
- Device behaviour lives in a **fact registry** (`fc200v/model.ts`). A calculator tab is shown to students only when the simulator passes **and every fact the sequence uses is confirmed** by a reviewer in `/academy/admin/calculator` (with a manual page/section reference). Otherwise students get the verified formula solution — never invented calculator instructions.
- The FC-200V is the initial reference model (`courses.calculator_model`). Another model needs its own keys, facts, builders and simulator.

**Fact status at delivery:** all 16 facts are *pending*. The Casio manual host was not reachable from the build environment; 7 facts are backed by secondary sources (manual excerpts quoted in search results), 9 have no primary source yet (e.g. the Set menu key path, whether the cursor stays on the row after `EXE`, the CNVR screen layout, the nCr/nPr/x! key positions, the `COMP` mode key, clearing the cash-flow editor). A reviewer must check them on the device before students see calculator tabs.

## Content workflow (Claude)

`/academy/admin/ai`: upload the official syllabus and authorised materials → split into units/lessons → lesson plans → questions at difficulty 1–3 with graded solutions. Every generated question is checked against the math engine and the simulator and lands in **review**; a question that failed verification cannot be approved. NotebookLM source documents are assembled from verified content only.

## NotebookLM and Video Studio

Implemented against the official **Gemini Notebook Enterprise (formerly NotebookLM Enterprise) API, v1alpha** on Discovery Engine: `notebooks.create`, `notebooks.sources.batchCreate` (`userContents` with `textContent` / `webContent`), `notebooks.sources.uploadFile`, `notebooks.sources.get`. Deletion is not implemented. Auth is a Google OAuth token of a licensed user (refresh-token flow supported).

There is no documented API for creating or downloading Video Overviews, so production is a structured manual workflow in `/academy/admin/studio`:

1. Create a **production package** (script, NotebookLM instructions, source documents, review checklist). For calculation questions the script follows: question → data → calculator function → *rendered calculator segment* → result → meaning and a common mistake. Optional Claude rewrite is rejected if it introduces numbers that are not in the verified sources.
2. **Prepare the notebook** (API when configured, otherwise a manual record + downloadable sources; paste the notebook link).
3. Produce the Video Overview in NotebookLM and download it. Calculator key presses are **not** produced by NotebookLM: record the deterministic segment with `ACADEMY_RENDER_TOKEN=… npm run academy:render-calculator -- <questionId>` and edit it in.
4. **Upload** (local or direct-to-R2). Automatic checks: type, magic bytes, size, MP4 duration/resolution.
5. **Review**: academic, numbers, calculator segment, Hebrew, quality — all required; a calculation question's video cannot be approved while its calculator sequence is unverified.
6. **Publish** (admin). Previous published version becomes *superseded*; versions, links to other questions and view statistics are kept.

`VideoProvider` allows an automatic provider later without changing the studio.

## Safety rails

- Nothing generated or imported is shown to students before a reviewer approves it; publishing a lesson (paid content) is admin-only and asks for confirmation.
- Re-importing content never deletes rows; changed items return to review; student attempts, grades and progress are keyed by stable ids and survive reorganisation. Published assignments pin question versions.
- Policy pages (terms, privacy, accessibility) are drafts marked for legal review; they are not a compliance claim.
- No production deployment, deletion of external resources or exposure of paid content happens automatically.

## Environment

See `academy.env.example`. Server-only secrets: `CF_API_TOKEN`, `R2_*`, `ANTHROPIC_API_KEY`, `NOTEBOOKLM_*`.
