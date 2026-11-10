# Gap analysis: current build vs. Knowledge Base v1.0 (10.11.2026)

Source of truth: `docs/knowledge/Pension_AI_Academy_Knowledge_v1.md`. That document is accumulated context, **not a final spec and not approval for development**. Where it conflicts with earlier development prompts, the later explicit requirements of the product owner win. Nothing below has been implemented yet; this file lists what would change.

## Conflicts with the current build (remove or change)

| # | Current build | Knowledge base | Proposed change |
|---|---|---|---|
| 1 | Student-facing AI tutor: chat panel in the lesson player, "שאל את המורה AI" tab in solutions, AI recommendation card on the dashboard | No AI chat, no personal AI tutor, no real-time recommendations for students (§2.4, §16) | Remove every student-facing AI element. Keep Claude only in the back-office content factory (§9). |
| 2 | Practice questions + short lesson quiz (2–4 questions) + unit exam + timed simulation | Each lesson has one fixed **assignment of 20 questions** (admin parameter, default 20), same questions and order for every student; an "מטלות" area lists assignment 1, 2, … (§2.5, §4 steps 6–8) | Replace practice/quiz with `assignments` (one per lesson, default 20). Question flow: one question, 4 options, save answer, previous/next, "צפה בפתרון". Summary: correct count, percent, wrong-answer list, saved attempt. |
| 3 | Solution video optional per question | Every question has a fixed, approved **short solution video** (≈30 s–2 min) (§2.6, §10) | Make the solution video part of each question's publish checklist; show it under "צפה בפתרון". |
| 4 | No help channel | "צריכים עזרה?" on every question opens a **human** message form; the request carries student, course, lesson, assignment, question, date and possibly the chosen answer (§2.8, §5) | Add `help_requests` (+ admin inbox). Delivery target (panel / email / WhatsApp) is still open. |
| 5 | Lesson page: video, summary tabs, formulas, examples | Above the player: **"שאלות השיעור — PDF"** and **"דף נוסחאות — PDF"**; the lecturer solves exactly the questions in that PDF; player chapters; button "למטלה N — 20 שאלות" below (§2.9, §4 step 5, §8, §11) | Generate real RTL PDFs (Hebrew text RTL, formulas LTR) from versioned content; questions in the PDF share ids/versions with the lesson video. |
| 6 | Syllabus: 6 units (Unit 1 TVM built, others drafts) | 14 chapters in 3 divisions: finance (1–6), statistics (7–11, combinatorics is chapter 7 inside statistics), investments (12–14: stock valuation, Markowitz, CAPM) (§6) | Re-map units to the 14 chapters after checking against the official syllabus. Lessons need not be 1:1 with chapters. |
| 7 | Dashboard with accuracy, weak topics, next steps, activity | Simple personal area: "הקורסים שלי", progress, assignment grades, lesson menu; no complex dashboards (§4 step 3, §16) | Simplify the dashboard to courses, progress and assignment grades. |
| 8 | Access: first lesson free + free trial + manual activation | Access opens **only after verified payment**; package types and prices are open (§2.1, §4 step 2) | Decide whether a free lesson/trial stays. Integrate a verified Israeli PSP with webhook-verified entitlements. |
| 9 | Question edits after publish send the item back to review under the same id | A change after publish requires a **new version**, so old grades stay consistent (§10) | Add question versions; attempts reference a version. |
| 10 | Roles: student / reviewer / admin | Guest, Student; Admin, Content Editor, Academic Reviewer, Super Admin, Support (§12) | Extend roles. |
| 11 | Calculator content uses P/Y and C/Y = 12 for monthly problems | The course book and the summary sheet teach CMPD with **P/Y = C/Y = 1** and I% as the rate per period ("יתר השורות לא רלוונטיות, תמיד יהיו על 1") | Re-author calculator plans to the course's convention, so lessons, PDFs and videos teach one method. |
| 12 | Narration has one text | Separate `display_text` and `spoken_text`, pronunciation dictionary, real Hebrew TTS samples before choosing a voice (§9) | Add to production packages. |

## Already aligned

- Combinatorics is inside Statistics & Probability, not a separate navigation item.
- Calculator-first solutions with the formula as the secondary method; no invented key sequences (fact registry + simulator).
- All AI-generated content is verified (independent math engine) and approved before publication; same content for every student.
- NotebookLM: only documented operations, manual Video Overview workflow, deterministic calculator animation, video review before publish.
- D1 / R2 on Cloudflare; server-side authorisation; private media; no card data stored.
- Design direction (clean SaaS, white space, strong typography, sharp corners, RTL) — minus the AI chat elements.

## Calculator facts found in the course material (secondary sources, still to confirm on the device)

From photographed pages of the course book (CASIO FC-100V/200V appendix) and the summary sheet:

- Recommended reset before CMPD work: `SHIFT 9`, scroll with the arrows to `ALL`, `EXE`, `EXE`, `AC`.
- CMPD rows used: Set (Begin/End; End is the default), n, I%, PV, PMT, FV; the remaining rows stay at 1.
- `SOLVE` is the blue key at the top right; enter four values, stand on the fifth and press `SOLVE`.
- Sign convention: money the client deposits is negative, money received is positive.
- n and I% must use the same time unit (years with an annual rate, months with a monthly rate).
- Worked check: n=3, I%=5, PV=−6,000, PMT=0 → FV = 6,945.75.

These would move several registry facts (`cmpd.entry`, `cmpd.rows`, `solve.key`, `input.neg`, `cmpd.convention`) from "secondary source" to "course book", and add a reset fact. A reviewer still confirms them on the physical calculator.

## Exam facts stated in the course book (for simulations; verify against the official exam rules)

20 multiple-choice questions; pass mark 60 (12 correct); 2.5 hours; no scratch paper; allowed: financial calculator and the uniform formula sheet handed out at the exam; held by the Israel Securities Authority, usually twice a year. The current timed simulation (13 questions, 30 minutes, pass 70) does not match these.

## Open decisions (from §17)

Target lesson length; whether "צפה בפתרון" is allowed before answering and how it affects the grade; repeat attempts and grade history; where help requests go; final calculator model (FC-100V, FC-200V or both); pricing model; NotebookLM automation and commercial rights; exact lesson list after the official syllabus check; payment, TTS, storage, rendering and math-verification vendors; who approves content.

## Source material handling

The photographed book pages and the scanned/handwritten PDFs are reference material only. They are not committed to the repository, and no text, tables or exercises are copied into course content (§2.10, §14).
