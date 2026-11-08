# AI Pension Academy — Finance & Statistics course

A single commercial course (Finance & Statistics for Israeli pension-advisor licensing), built end to end as a standalone Next.js app (served under `/academy`; `/` redirects there). Student-facing content is Hebrew; code and documentation are English.

Unit 1 (time value of money) is fully built and verified. Units 2–6 are draft outlines that use the same components; combinatorics is part of **Unit 5 — Statistics & Probability (part B)**, not a separate module.

## Quick start (local)

```bash
npm install
npm run dev            # http://localhost:3000/academy
npm test               # 72 tests (math, calculator, content, auth, billing, journey, AI, integrations)
```

First run creates `.data/academy.sqlite` and imports the course **in review status** — nothing is visible to students yet. The first account you register becomes admin. Then:

1. `/academy/admin/calculator` — confirm the CASIO FC-200V facts against the official User's Guide or the device (see *Calculator-first* below).
2. `/academy/admin/content` — open each lesson, read the automatic verification report, approve questions, publish the lesson.
3. Register a second account to experience the student side.

## Architecture

| Area | Where | Notes |
|---|---|---|
| Data | `src/academy/db` | `SqlDb` interface in the SQLite dialect. Drivers: `node:sqlite` (dev/tests), Cloudflare **D1 via REST** (`d1-http`, works on Netlify/Node), D1 **binding** (when deployed on Cloudflare). Migrations in `db/migrations`, applied automatically; `npm run academy:d1-sql` exports them for `wrangler d1 migrations apply`. |
| Auth | `src/academy/auth` | PBKDF2-SHA256 passwords, opaque session tokens (only SHA-256 hashes stored), httpOnly SameSite=Lax cookie, same-origin check on writes. Roles: student / reviewer / admin. |
| Entitlements | `src/academy/billing/entitlements.ts` | All access decisions are server-side (`decideLessonAccess`). Free lessons, one trial per user, paid subscription, cancel-at-period-end, expiry, admin revoke. |
| Payments | `src/academy/billing/payment-provider.ts` | **No simulated payments.** Provider `none` until a verified PSP is integrated (hosted payment page + signed webhooks → `/api/academy/billing/webhook/[provider]`). Meanwhile admins record paid periods manually with a payment reference (audited). |
| Math engine | `src/academy/math` | Independent finance/statistics formulas + a safe expression evaluator (whitelisted functions, no `eval`). |
| Calculator | `src/academy/calculator` | FC-200V model (keys + facts), plan→key-sequence builders, deterministic simulator, verdicts. |
| Content | `src/academy/content` | Course definition (Unit 1 + outlines), verification, idempotent import that never deletes rows. |
| Services | `src/academy/services` | Learning (lessons, answers, quizzes, progress), content review gates, Video Studio, calculator facts. |
| AI | `src/academy/ai` | Claude client (Opus 5.5 by default, server-side refusal fallbacks), calculator-first tutor with deterministic tools, content engine. |
| NotebookLM | `src/academy/notebook` | `NotebookProvider` (official v1alpha endpoints only), `VideoProvider` (manual today), production packages. |
| Storage | `src/academy/storage` | Local disk or Cloudflare R2 (SigV4 presigned URLs, no SDK); automatic video file checks. |
| UI | `src/app/academy`, `src/components/academy` | Tailwind v4, RTL, responsive. Admin under `/academy/admin`. Deterministic calculator render at `/render/calculator/[questionId]`. |

### Compatibility note (Cloudflare)

No hosting is configured yet. On any Node host (Netlify, Vercel, a VM) use D1 through its REST API (`ACADEMY_DB_DRIVER=d1-http`) and R2 through its S3 API. Running on Cloudflare Workers needs the OpenNext Cloudflare adapter and the `d1-binding` driver. No production deployment was performed.

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
- Re-importing content never deletes rows; changed items return to review; student attempts, quiz results and progress are keyed by stable ids and survive reorganisation.
- No production deployment, deletion of external resources or exposure of paid content happens automatically.

## Environment

See `academy.env.example`. Server-only secrets: `CF_API_TOKEN`, `R2_*`, `ANTHROPIC_API_KEY`, `NOTEBOOKLM_*`.
