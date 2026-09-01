PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  teacher_id TEXT NOT NULL REFERENCES users(id),
  academic_year TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

CREATE TABLE IF NOT EXISTS enrollments (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);

CREATE TABLE IF NOT EXISTS lectures (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lectures_class ON lectures(class_id, sort_order);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('pdf', 'docx', 'pptx', 'video', 'image', 'link')),
  title TEXT NOT NULL,
  file_path TEXT,
  link_url TEXT,
  original_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materials_lecture ON materials(lecture_id);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('question', 'exam')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id, module);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mcq', 'essay', 'fill')),
  content TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  correct_answer TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  bloom_level TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  image_path TEXT,
  is_public_bank INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_owner ON questions(owner_id, type);
CREATE INDEX IF NOT EXISTS idx_questions_bloom ON questions(bloom_level);
CREATE INDEX IF NOT EXISTS idx_questions_folder ON questions(folder_id);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 45,
  question_ids_json TEXT NOT NULL DEFAULT '[]',
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_exams_creator ON exams(creator_id, status);

CREATE TABLE IF NOT EXISTS exam_results (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'disconnected', 'submitted')),
  remaining_sec INTEGER NOT NULL DEFAULT 0,
  saved_answers_json TEXT NOT NULL DEFAULT '{}',
  score REAL,
  red_flags INTEGER NOT NULL DEFAULT 0,
  answers_detail_json TEXT NOT NULL DEFAULT '{}',
  ai_evaluation TEXT,
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON exam_results(exam_id, status);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  periods_total INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (class_id, session_date)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late')),
  periods_absent INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);

CREATE TABLE IF NOT EXISTS grades (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kttx REAL,
  process_1 REAL,
  final_exam REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS class_groups (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_class_groups_class ON class_groups(class_id);

CREATE TABLE IF NOT EXISTS class_group_members (
  group_id TEXT NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, student_id)
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  host_teacher_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  game_type TEXT NOT NULL,
  room_code TEXT NOT NULL UNIQUE,
  exam_id TEXT REFERENCES exams(id) ON DELETE SET NULL,
  question_ids_json TEXT NOT NULL DEFAULT '[]',
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'running', 'finished')),
  current_question_index INTEGER NOT NULL DEFAULT -1,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_host ON game_sessions(host_teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_game_class ON game_sessions(class_id, status);

CREATE TABLE IF NOT EXISTS game_results (
  game_session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT NOT NULL DEFAULT '{}',
  approved_into_grades INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_session_id, student_id)
);

CREATE TABLE IF NOT EXISTS game_circuit_runtime (
  game_session_id TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  challenge_index INTEGER NOT NULL DEFAULT 0,
  challenge_ends_at INTEGER NOT NULL DEFAULT 0,
  is_paused INTEGER NOT NULL DEFAULT 0 CHECK (is_paused IN (0, 1)),
  remaining_ms INTEGER NOT NULL DEFAULT 0 CHECK (remaining_ms >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_circuit_runtime_updated ON game_circuit_runtime(updated_at);

CREATE TABLE IF NOT EXISTS game_circuit_player_states (
  game_session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  circuit_json TEXT,
  circuit_challenge_id TEXT,
  simulation_state TEXT NOT NULL DEFAULT 'idle'
    CHECK (simulation_state IN ('idle', 'running', 'paused', 'completed', 'start', 'stop', 'step', 'reset')),
  measurements_json TEXT NOT NULL DEFAULT '{}',
  completed_challenges_json TEXT NOT NULL DEFAULT '[]',
  last_activity_at INTEGER NOT NULL DEFAULT 0 CHECK (last_activity_at >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (game_session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_game_circuit_players_session ON game_circuit_player_states(game_session_id, updated_at);

CREATE TABLE IF NOT EXISTS rag_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsing', 'ready', 'error')),
  error_msg TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rag_docs_owner ON rag_documents(owner_id, status);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  rag_doc_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  heading_path TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 0,
  embedding BLOB,
  UNIQUE (rag_doc_id, seq)
);

CREATE TABLE IF NOT EXISTS ai_usage_counters (
  feature TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (feature, usage_date)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_encrypted TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
