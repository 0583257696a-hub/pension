-- AI Pension Academy — base schema (SQLite dialect, compatible with Cloudflare D1)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','reviewer','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,               -- sha256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description_md TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  price_ils INTEGER NOT NULL DEFAULT 0,          -- monthly price in agorot-free integer shekels
  trial_days INTEGER NOT NULL DEFAULT 7,
  calculator_model TEXT NOT NULL DEFAULT 'casio-fc-200v', -- reference calculator for all calculator-first solutions
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description_md TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published')),
  UNIQUE (course_id, slug)
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  summary_md TEXT NOT NULL DEFAULT '',
  formulas_json TEXT NOT NULL DEFAULT '[]',      -- [{name, latex|plain, meaning}]
  examples_json TEXT NOT NULL DEFAULT '[]',      -- [{title, problem_md, solution_md}]
  objectives_json TEXT NOT NULL DEFAULT '[]',    -- [string]
  access TEXT NOT NULL DEFAULT 'paid' CHECK (access IN ('free','paid')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published')),
  estimated_minutes INTEGER NOT NULL DEFAULT 20,
  video_asset_id TEXT,                           -- published lesson video (FK kept soft to avoid cycles)
  content_hash TEXT,                             -- hash of imported content; a change sends the lesson back to review
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (unit_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_lessons_unit ON lessons(unit_id, position);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  stem_md TEXT NOT NULL,
  options_json TEXT NOT NULL,                    -- [{key:'a', text}]
  correct_key TEXT NOT NULL,
  short_explanation_md TEXT NOT NULL DEFAULT '',
  solution_steps_json TEXT NOT NULL DEFAULT '[]',-- formula presentation: [{title, body_md}]
  calculator_json TEXT,                          -- calculator presentation: {plan, sequence} for the course calculator, or NULL
  verification_json TEXT NOT NULL DEFAULT '{}',  -- {status:'unverified'|'verified'|'failed', checks:[...], checked_at}
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','rejected')),
  solution_video_asset_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  role TEXT NOT NULL DEFAULT 'practice' CHECK (role IN ('practice','quiz')),
  content_hash TEXT,                             -- hash of imported content; a change sends the question back to review
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_lesson ON questions(lesson_id, position);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('lesson','unit','simulation')),
  title TEXT NOT NULL,
  question_ids_json TEXT NOT NULL DEFAULT '[]',
  pass_score INTEGER NOT NULL DEFAULT 70,
  time_limit_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published'))
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}',       -- {questionId: key}
  score INTEGER,
  passed INTEGER,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, quiz_id);

CREATE TABLE IF NOT EXISTS question_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  chosen_key TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  context TEXT NOT NULL DEFAULT 'practice',      -- practice | quiz
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_question_attempts_user ON question_attempts(user_id, question_id);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  video_seconds INTEGER NOT NULL DEFAULT 0,
  video_completed INTEGER NOT NULL DEFAULT 0,
  practice_done INTEGER NOT NULL DEFAULT 0,
  quiz_passed INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('trial','active','canceled','expired')),
  provider TEXT NOT NULL DEFAULT 'manual',       -- manual | trial | <psp name>
  provider_ref TEXT,
  trial_ends_at TEXT,
  current_period_end TEXT,
  canceled_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, course_id);

CREATE TABLE IF NOT EXISTS video_assets (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('lesson','question')),
  target_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,
  checks_json TEXT NOT NULL DEFAULT '{}',        -- file checks + reviewer checklist
  status TEXT NOT NULL CHECK (status IN ('uploading','uploaded','review','approved','rejected','published','superseded')),
  notebook_id TEXT,
  production_package_id TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_video_assets_target ON video_assets(target_type, target_id, version);

CREATE TABLE IF NOT EXISTS video_views (
  id TEXT PRIMARY KEY,
  video_asset_id TEXT NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  seconds_watched INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_video_views_asset ON video_views(video_asset_id);

CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'notebooklm_enterprise',
  external_name TEXT,                            -- projects/.../notebooks/{id}
  external_id TEXT,
  external_url TEXT,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('lesson','question')),
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','created','sources_processing','ready','error','manual')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notebooks_target ON notebooks(target_type, target_id);

CREATE TABLE IF NOT EXISTS notebook_sources (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  external_name TEXT,
  external_id TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',             -- text | web | file | google_doc | youtube
  content_md TEXT,                               -- the document we sent (for text sources)
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | processing | ready | error
  status_raw TEXT,
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS production_packages (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('lesson','question')),
  target_id TEXT NOT NULL,
  notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  script_md TEXT NOT NULL,                       -- narration script for the video
  instructions_md TEXT NOT NULL,                 -- NotebookLM steering prompt / customisation text
  sources_md TEXT NOT NULL,                      -- source documents bundle
  checklist_json TEXT NOT NULL DEFAULT '[]',     -- reviewer checklist for the produced video
  generated_by TEXT NOT NULL DEFAULT 'template', -- template | claude
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','used')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_packages_target ON production_packages(target_type, target_id);

CREATE TABLE IF NOT EXISTS course_materials (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('syllabus','source','regulation','other')),
  title TEXT NOT NULL,
  text_content TEXT NOT NULL DEFAULT '',
  storage_key TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS content_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                            -- syllabus_split | lesson_plan | questions | solutions | verify | notebook_sources | production_package
  target_type TEXT,
  target_id TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','applied')),
  error TEXT,
  model TEXT,
  usage_json TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS content_reviews (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,                     -- lesson | question | video | unit
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve','reject','request_changes','publish','unpublish')),
  note TEXT,
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON content_reviews(target_type, target_id);

CREATE TABLE IF NOT EXISTS tutor_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
  messages_json TEXT NOT NULL DEFAULT '[]',      -- [{role:'user'|'assistant', content, at}]
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tutor_threads_user ON tutor_threads(user_id, lesson_id);

-- Facts about a calculator model (modes, keys, screen behaviour) that every
-- key sequence relies on. A calculator solution is shown to students only when
-- every fact it depends on was confirmed by a reviewer against the manual or
-- the physical device, and the deterministic simulator reproduces it.
CREATE TABLE IF NOT EXISTS calculator_facts (
  model TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  manual_ref TEXT,
  note TEXT,
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  PRIMARY KEY (model, fact_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
