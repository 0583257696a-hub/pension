// Master spec v1: numbered lessons mapped to chapters, fixed assignments with
// versioned questions, help requests, lesson PDFs, and commerce (plans, coupons,
// orders, idempotent payment events, entitlements). Additive only: existing
// rows (users, progress, subscriptions) stay untouched.
const sql = `
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  part TEXT NOT NULL CHECK (part IN ('finance','statistics','investments')),
  title TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (course_id, number)
);

CREATE TABLE IF NOT EXISTS lesson_chapters (
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, chapter_id)
);

ALTER TABLE lessons ADD COLUMN number INTEGER;
ALTER TABLE lessons ADD COLUMN topics_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN checkpoints_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN video_chapters_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE questions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Immutable snapshot of a question as it was approved. Assignments pin these,
-- so grades never change when a question is edited later.
CREATE TABLE IF NOT EXISTS question_versions (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (question_id, version)
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 20,
  solution_policy TEXT NOT NULL DEFAULT 'anytime' CHECK (solution_policy IN ('anytime','after_answer','after_submit')),
  allow_retake INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (lesson_id)
);

-- Editable list for the next version.
CREATE TABLE IF NOT EXISTS assignment_items (
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  points REAL,
  PRIMARY KEY (assignment_id, question_id)
);

-- Published, immutable versions: [{questionId, questionVersion, points}].
CREATE TABLE IF NOT EXISTS assignment_versions (
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  total_points REAL NOT NULL,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (assignment_id, version)
);

CREATE TABLE IF NOT EXISTS assignment_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  assignment_version INTEGER NOT NULL,
  attempt_no INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('official','practice')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
  current_position INTEGER NOT NULL DEFAULT 1,
  score REAL,
  correct_count INTEGER,
  total_count INTEGER,
  earned_points REAL,
  total_points REAL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  submitted_at TEXT,
  UNIQUE (user_id, assignment_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS idx_assignment_attempts_user ON assignment_attempts(user_id, assignment_id);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id TEXT NOT NULL REFERENCES assignment_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question_version INTEGER NOT NULL,
  position INTEGER NOT NULL,
  chosen_key TEXT,
  answered_at TEXT,
  solution_viewed_at TEXT,
  viewed_before_answer INTEGER NOT NULL DEFAULT 0,
  is_correct INTEGER,
  points_awarded REAL,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  lesson_id TEXT,
  assignment_id TEXT,
  attempt_id TEXT,
  question_id TEXT,
  question_version INTEGER,
  question_position INTEGER,
  chosen_key TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','answered','closed')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  student_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_help_requests_user ON help_requests(user_id, created_at);

CREATE TABLE IF NOT EXISTS help_messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('student','staff')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_help_messages_request ON help_messages(request_id, created_at);

CREATE TABLE IF NOT EXISTS lesson_assets (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('questions_pdf','formulas_pdf','homework_pdf','summary_pdf','supplement_pdf')),
  title TEXT NOT NULL,
  version INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'renderer' CHECK (generated_by IN ('renderer','upload')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_lesson_assets_lesson ON lesson_assets(lesson_id, kind, version);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('one_time','monthly','annual')),
  title TEXT NOT NULL,
  price_agorot INTEGER NOT NULL,
  access_days INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('percent','amount')),
  value INTEGER NOT NULL,
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
  valid_until TEXT,
  max_redemptions INTEGER,
  redemptions INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  coupon_code TEXT,
  list_price_agorot INTEGER NOT NULL,
  amount_agorot INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','canceled','refunded')),
  provider TEXT NOT NULL,
  provider_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);

-- Every webhook event is recorded once; a repeated delivery is a no-op.
CREATE TABLE IF NOT EXISTS payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed','ignored','failed')),
  error TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (provider, event_id)
);

ALTER TABLE subscriptions ADD COLUMN plan_id TEXT;
ALTER TABLE subscriptions ADD COLUMN order_id TEXT;

-- The single source of truth for course access.
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('purchase','subscription','admin','coupon','legacy')),
  order_id TEXT,
  subscription_id TEXT,
  starts_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  note TEXT,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id, course_id);

-- Carry existing access (manual activations and trials still running) into entitlements.
INSERT OR IGNORE INTO entitlements (id, user_id, course_id, source, subscription_id, starts_at, expires_at, status, note)
  SELECT 'ent_' || id, user_id, course_id,
         CASE provider WHEN 'manual' THEN 'admin' WHEN 'trial' THEN 'legacy' ELSE 'subscription' END,
         id, created_at, COALESCE(current_period_end, trial_ends_at), 'active', note
  FROM subscriptions WHERE status IN ('trial','active','canceled');

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','handled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
export default sql;
