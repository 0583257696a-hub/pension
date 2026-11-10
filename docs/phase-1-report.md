# Phase report — Lesson 1 vertical slice (master spec §31–§38)

Date: 2026-11-10. Spec: `docs/knowledge/Pension_AI_Academy_Master_Development_Prompt.md`.

## Implemented

**Student journey (§3, §35)**
- Public site: home, course catalog, course page with the 14-chapter table of contents, pricing with plan choice and coupons, FAQ, contact form, terms / privacy / accessibility (drafts for legal review), registration, login.
- "הקורסים שלי": progress, assignment grades, next lesson. Numbered lesson list ("שיעור 1", "שיעור 2" …) with "צפה בשיעור" and "פתח מטלה".
- Lesson page: header (number, title, chapters, topics, duration, state), **PDFs above the video** (view / download / print), video with player chapters and practice checkpoints that pause the video, lesson questions with calculator-first solutions, homework card, summary.
- Assignments: list ("מטלות"), one question at a time, four options, autosave on every choice, previous / next, question map, "צפה בפתרון" (locks that answer, recorded), "צריכים עזרה?", "סיום והגשה", results ("ענית נכון על 16 מתוך 20 · הציון שלך: 80", wrong-answer list), grade history, practice attempts that never change the official grade.
- Help requests: student list and thread; admin inbox "פניות תלמידים" with statuses (חדשה / בטיפול / נענתה / נסגרה), assignment, replies.
- Account: access and expiry, subscription with cancel-at-period-end, access history, orders.
- Student-facing AI removed (tutor chat, "שאל את המורה AI" tab, AI marketing); old practice / quiz / exam URLs redirect.

**Content (§6, §10, §32)**
- 14 chapters in three parts; 16 numbered lessons mapped to them (admin-editable mapping table `lesson_chapters`).
- Lesson 1 "מבוא לריביות ותזרימי מזומנים": summary, 7 formulas, 6 lesson questions (including the spec's 6,000 ₪ / 5% / 3 years → 6,945.75 example), 6 checkpoints, 5 player chapters, **20 original assignment questions** with distractors built from typical mistakes. Every numeric item is checked three ways: independent Python calculation (authoring), the math engine, and the FC-200V simulator.
- Course convention from the course book: P/Y = C/Y = 1, I% per period (lessons 2–3 converted; a test enforces it).
- Lessons 2–16 are drafts (2 and 3 have partial content; 9 has two combinatorics questions).

**Admin (§25)**
- Assignment manager: pre-publication checks (§34), questions with status / verification / version / video, points override, add / remove, settings (question count, solution policy, retakes), grade report, version history.
- PDF manager: generate, preview, publish, "out of date" flag when content changed, video chapter and checkpoint timing.
- Support inbox, students & access (grant with reference, revoke), billing (plans, coupons, orders, webhook events, reconciliation), overview metrics (access, submissions, open requests, review queue).

**Platform**
- Migration `0002_academy_structure` (additive; existing users, progress and manual activations are carried into `entitlements`).
- Question versions + assignment versions (§24): old attempts keep grading against their frozen snapshot.
- Billing: idempotent webhook events, amount check, refunds revoke, subscription renewal / cancel / expiry, coupons (100% coupon grants without payment), reconciliation of lost webhooks.
- Hebrew PDF engine running in Node and Workers.
- Built-in content re-imports automatically when its version changes (always into review; nothing is published automatically).

## Verified

- `npm test`: 99 tests pass, including the §35 acceptance test (access → numbered lessons → Lesson 1 → PDFs → video → 20 fixed questions, same for every student → navigation and autosave → solution with lock → help request and admin reply → submission → grade 80 for 16/20 → saved → resume), version-pinning, solution policy, re-import safety, billing (signed test PSP), and the PDF engine (embedded fonts, deterministic output, RTL glyph order checked on the rendered pixels).
- `eslint` clean; `next build` and the OpenNext Workers build succeed.
- Browser walkthrough with `next start` (desktop + iPhone 13): the full flow including the UI for answering, solution, help form, submission and admin reply; no horizontal overflow on the checked pages.
- Workers runtime (`wrangler dev`, local D1 + R2): PDF generation and download, assignment, solution, help, grading.

## Known limitations

- **Calculator facts** (16) are still pending reviewer confirmation on the device or the official manual, so solutions currently show the verified formula method; the calculator tab appears automatically once confirmed.
- **No lesson or solution videos** exist yet; the pages say so plainly. Checkpoints pause only after an editor sets their times.
- **Payments**: no PSP integrated (provider `none`). Access today: admin grant with a reference, or a 100% coupon.
- Roles are still student / reviewer / admin (spec §12 roles not yet split); support members are staff users.
- Help-request notifications are in-app only (no email yet).
- Hebrew language engine (§22: display_text / spoken_text, pronunciation dictionary) and cost tracking (§33) are not built yet.
- The AI Content Factory still produces lesson plans and questions in the older shape; it does not yet produce the full §18 package (instructor script, 20-question assignment, PDFs, solution-video scripts, quality report).
- The lesson list still needs checking against the official syllabus; plan prices are placeholders to be set in the admin.

## External integrations still required

Israeli payment provider (hosted page + signed webhooks); email delivery for help replies and receipts; NotebookLM (manual workflow in place; official API only for notebooks / sources); legal review of terms / privacy / accessibility and of copyright for source material; accessibility audit.

## Production readiness

Not ready for a commercial launch: payments, videos, calculator-fact confirmation and legal review are open. Ready for internal review of Lesson 1 content and the student flow on a staging deployment.

## Next steps

1. Reviewer confirms calculator facts and approves Lesson 1; produce and upload the lesson video and the 20 solution videos.
2. Choose and integrate the PSP; set plan prices.
3. Extend the AI Content Factory to the §18 package, then produce Lessons 2–3 to 20 questions each.
4. Roles (§12), email notifications, Hebrew language engine (§22), cost tracking (§33).
