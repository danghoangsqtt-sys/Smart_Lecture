import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { BACKUP_DIR, DB_PATH, RESTORE_PENDING_PATH } from '../config.js';

function applyPendingRestore(): void {
  if (!existsSync(RESTORE_PENDING_PATH)) return;
  const header = readFileSync(RESTORE_PENDING_PATH).subarray(0, 16).toString('utf8');
  if (header !== 'SQLite format 3\u0000') {
    throw new Error('File restore-pending.db không phải SQLite hợp lệ');
  }
  if (existsSync(DB_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(DB_PATH, `${BACKUP_DIR}/pre-restore-${stamp}.db`);
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${DB_PATH}${suffix}`;
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }
  renameSync(RESTORE_PENDING_PATH, DB_PATH);
  console.log('[db] applied staged database restore');
}

applyPendingRestore();

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function migrate(): void {
  const schemaSql = readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf-8');
  db.exec(schemaSql);
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(1);

  const current = (db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as { v: number }).v;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    tx(() => {
      migration.up();
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
    });
    console.log(`[db] applied migration v${migration.version}`);
  }
}

const MIGRATIONS: { version: number; up: () => void }[] = [
  {
    version: 2,
    up: () => {
      db.exec(`
        CREATE TABLE questions_new (
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
        INSERT INTO questions_new SELECT * FROM questions;
        DROP TABLE questions;
        ALTER TABLE questions_new RENAME TO questions;
        CREATE INDEX IF NOT EXISTS idx_questions_owner ON questions(owner_id, type);
        CREATE INDEX IF NOT EXISTS idx_questions_bloom ON questions(bloom_level);
        CREATE INDEX IF NOT EXISTS idx_questions_folder ON questions(folder_id);
      `);
    },
  },
  {
    version: 3,
    up: () => {
      db.exec(`
        ALTER TABLE classes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE classes ADD COLUMN archived_at TEXT;
      `);
    },
  },
  {
    version: 4,
    up: () => {
      db.exec(`ALTER TABLE grades ADD COLUMN remark TEXT NOT NULL DEFAULT '';`);
    },
  },
  {
    version: 5,
    up: () => {
      db.exec(`
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
      `);
    },
  },
  {
    version: 6,
    up: () => {
      db.exec(`
        ALTER TABLE users ADD COLUMN student_code TEXT;
        ALTER TABLE users ADD COLUMN dob TEXT;
        ALTER TABLE users ADD COLUMN gender TEXT;
        ALTER TABLE users ADD COLUMN hometown TEXT;
        CREATE INDEX IF NOT EXISTS idx_users_student_code ON users(student_code);
      `);
    },
  },
  {
    version: 7,
    up: () => {
      db.exec(`
        ALTER TABLE classes ADD COLUMN total_periods INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE lectures ADD COLUMN completed_at TEXT;
      `);
    },
  },
  {
    version: 8,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schedule_events (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          event_type TEXT NOT NULL DEFAULT 'class' CHECK (event_type IN ('class', 'meeting', 'other')),
          room TEXT NOT NULL DEFAULT '',
          start_at TEXT NOT NULL,
          end_at TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          recurrence_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_schedule_teacher ON schedule_events(teacher_id, start_at);
        CREATE INDEX IF NOT EXISTS idx_schedule_room ON schedule_events(room, start_at);
        CREATE INDEX IF NOT EXISTS idx_schedule_class ON schedule_events(class_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_recurrence ON schedule_events(recurrence_id);
      `);
    },
  },
  {
    version: 9,
    up: () => {
      db.exec(`
        ALTER TABLE attendance_sessions ADD COLUMN teaching_type TEXT NOT NULL DEFAULT '';
        ALTER TABLE attendance_sessions ADD COLUMN remark TEXT NOT NULL DEFAULT '';

        CREATE TABLE attendance_records_new (
          session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
          periods_absent INTEGER NOT NULL DEFAULT 0,
          reason TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (session_id, student_id)
        );
        INSERT INTO attendance_records_new (session_id, student_id, status, periods_absent, reason)
        SELECT session_id, student_id,
          CASE WHEN status = 'late' THEN 'present' ELSE status END,
          CASE WHEN status = 'late' THEN 0 ELSE periods_absent END,
          reason
        FROM attendance_records;
        DROP TABLE attendance_records;
        ALTER TABLE attendance_records_new RENAME TO attendance_records;
        CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
      `);
    },
  },
  {
    version: 10,
    up: () => {
      db.exec(`
        ALTER TABLE lectures ADD COLUMN planned_periods INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE attendance_sessions ADD COLUMN lecture_id TEXT REFERENCES lectures(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_attendance_sessions_lecture ON attendance_sessions(lecture_id);

        CREATE TABLE IF NOT EXISTS group_grades (
          class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          group_id TEXT NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
          kttx REAL,
          process_1 REAL,
          final_exam REAL,
          remark TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (class_id, group_id)
        );
      `);
    },
  },
  {
    version: 11,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS teaching_plans (
          id TEXT PRIMARY KEY,
          class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          total_periods INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_teaching_plans_class ON teaching_plans(class_id);

        CREATE TABLE IF NOT EXISTS curriculum_items (
          id TEXT PRIMARY KEY,
          teaching_plan_id TEXT NOT NULL REFERENCES teaching_plans(id) ON DELETE CASCADE,
          week INTEGER,
          chapter TEXT NOT NULL DEFAULT '',
          topic TEXT NOT NULL,
          planned_periods INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          completed_periods INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
          lecture_id TEXT REFERENCES lectures(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_curriculum_items_plan ON curriculum_items(teaching_plan_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_curriculum_items_lecture ON curriculum_items(lecture_id);

        ALTER TABLE attendance_sessions ADD COLUMN teaching_plan_item_id TEXT REFERENCES curriculum_items(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_attendance_sessions_tpi ON attendance_sessions(teaching_plan_item_id);
      `);
    },
  },
  {
    version: 12,
    up: () => {
      // curriculum_items.lecture_id and its index were already added inline by v11's
      // CREATE TABLE; this migration is now a no-op kept only to preserve version numbering.
    },
  },
  {
    version: 13,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS subjects (
          id TEXT PRIMARY KEY,
          class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_subjects_class ON subjects(class_id);

        ALTER TABLE teaching_plans ADD COLUMN subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_teaching_plans_subject ON teaching_plans(subject_id);

        ALTER TABLE lectures ADD COLUMN subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_lectures_subject ON lectures(subject_id);

        ALTER TABLE materials ADD COLUMN converted_from_id TEXT REFERENCES materials(id) ON DELETE CASCADE;

        CREATE TABLE IF NOT EXISTS intake_ingested (
          subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (subject_id, filename)
        );
      `);

      // Backfill: every existing class gets exactly one subject, seeded from its current
      // free-text `subject` column, and all its existing plans/lectures get linked to it.
      // This is lossless and requires no manual re-entry — classes.subject keeps working
      // as-is for display until the user adds more subjects.
      const classes = db.prepare('SELECT id, subject FROM classes').all() as { id: string; subject: string }[];
      const insertSubject = db.prepare('INSERT INTO subjects (id, class_id, name) VALUES (?, ?, ?)');
      const linkPlans = db.prepare('UPDATE teaching_plans SET subject_id = ? WHERE class_id = ?');
      const linkLectures = db.prepare('UPDATE lectures SET subject_id = ? WHERE class_id = ?');
      for (const c of classes) {
        const subjectId = randomUUID();
        insertSubject.run(subjectId, c.id, c.subject?.trim() || 'Môn học chính');
        linkPlans.run(subjectId, c.id);
        linkLectures.run(subjectId, c.id);
      }
    },
  },
{ version: 14, up: () => { db.exec(`CREATE TABLE IF NOT EXISTS curriculum_documents (id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, title TEXT NOT NULL, file_path TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_curriculum_documents_subject ON curriculum_documents(subject_id, created_at DESC);`); } },
  {
    version: 15,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS lesson_plans (
          id TEXT PRIMARY KEY,
          curriculum_item_id TEXT NOT NULL REFERENCES curriculum_items(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          script TEXT NOT NULL DEFAULT '',
          planned_duration INTEGER NOT NULL DEFAULT 45,
          slide_material_id TEXT REFERENCES materials(id) ON DELETE SET NULL,
          video_material_id TEXT REFERENCES materials(id) ON DELETE SET NULL,
          game_session_id TEXT REFERENCES game_sessions(id) ON DELETE SET NULL,
          question_set_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_lesson_plans_item ON lesson_plans(curriculum_item_id);
      `);

      // Idempotent ALTER TABLE - only add columns that don't exist
      const addColumn = (table: string, column: string, def: string): void => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        if (!cols.some(c => c.name === column)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
        }
      };

      addColumn('questions', 'subject_id', 'TEXT REFERENCES subjects(id) ON DELETE SET NULL');
      addColumn('questions', 'chapter', "TEXT NOT NULL DEFAULT ''");
      addColumn('questions', 'lesson', "TEXT NOT NULL DEFAULT ''");
      addColumn('questions', 'difficulty', "TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard'))");
      addColumn('questions', 'bloom_level', "TEXT NOT NULL DEFAULT ''");
      addColumn('questions', 'content_hash', "TEXT NOT NULL DEFAULT ''");

      addColumn('exams', 'subject_id', 'TEXT REFERENCES subjects(id) ON DELETE SET NULL');
      addColumn('game_sessions', 'subject_id', 'TEXT REFERENCES subjects(id) ON DELETE SET NULL');
      addColumn('game_sessions', 'prepared_game_type', "TEXT NOT NULL DEFAULT ''");
      addColumn('game_sessions', 'room_state', "TEXT NOT NULL DEFAULT 'lobby' CHECK (room_state IN ('lobby', 'running', 'paused', 'finished'))");
      addColumn('game_sessions', 'participant_count', 'INTEGER NOT NULL DEFAULT 0');

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
        CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter);
        CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(content_hash);
        CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject_id);
        CREATE INDEX IF NOT EXISTS idx_game_sessions_subject ON game_sessions(subject_id);
      `);
    },
  },
  {
    version: 16,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS teaching_logs (
          id TEXT PRIMARY KEY,
          class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
          curriculum_item_id TEXT REFERENCES curriculum_items(id) ON DELETE SET NULL,
          attendance_session_id TEXT REFERENCES attendance_sessions(id) ON DELETE SET NULL,
          lesson_plan_id TEXT REFERENCES lesson_plans(id) ON DELETE SET NULL,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          ended_at TEXT,
          slides_shown TEXT NOT NULL DEFAULT '[]',
          videos_played TEXT NOT NULL DEFAULT '[]',
          games_run TEXT NOT NULL DEFAULT '[]',
          attendance_taken INTEGER NOT NULL DEFAULT 0,
          kttx_awarded TEXT NOT NULL DEFAULT '[]',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_teaching_logs_class ON teaching_logs(class_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_teaching_logs_subject ON teaching_logs(subject_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS document_versions (
          id TEXT PRIMARY KEY,
          material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          version_number INTEGER NOT NULL,
          file_path TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          change_log TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_document_versions_material ON document_versions(material_id, version_number DESC);

        CREATE TABLE IF NOT EXISTS media_audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action TEXT NOT NULL CHECK (action IN ('upload', 'delete', 'update', 'convert')),
          material_id TEXT,
          file_path TEXT,
          old_size INTEGER,
          new_size INTEGER,
          metadata TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_media_audit_log_user ON media_audit_log(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_media_audit_log_material ON media_audit_log(material_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS backup_log (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'in_progress')),
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_backup_log_created ON backup_log(created_at DESC);
      `);
    },
  },
  {
    version: 17,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS question_usage_stats (
          question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
          times_used INTEGER NOT NULL DEFAULT 0,
          times_correct INTEGER NOT NULL DEFAULT 0,
          times_in_exam INTEGER NOT NULL DEFAULT 0,
          times_in_game INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT,
          difficulty_estimate REAL
        );

        CREATE TABLE IF NOT EXISTS prepared_games (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
          class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
          game_type TEXT NOT NULL,
          title TEXT NOT NULL,
          config_json TEXT NOT NULL DEFAULT '{}',
          question_ids_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_prepared_games_teacher ON prepared_games(teacher_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_prepared_games_subject ON prepared_games(subject_id, created_at DESC);
      `);
    },
  },
  {
    version: 18,
    up: () => {
      const columns = db.prepare('PRAGMA table_info(game_sessions)').all() as { name: string }[];
      if (!columns.some((column) => column.name === 'class_id')) {
        db.exec('ALTER TABLE game_sessions ADD COLUMN class_id TEXT REFERENCES classes(id) ON DELETE SET NULL');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_game_class ON game_sessions(class_id, status)');
    },
  },
  {
    version: 19,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS game_circuit_runtime (
          game_session_id TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
          challenge_index INTEGER NOT NULL DEFAULT 0,
          challenge_ends_at INTEGER NOT NULL DEFAULT 0,
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
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (game_session_id, student_id)
        );
        CREATE INDEX IF NOT EXISTS idx_game_circuit_players_session
          ON game_circuit_player_states(game_session_id, updated_at);
      `);
    },
  },
  {
    version: 20,
    up: () => {
      const columns = db.prepare('PRAGMA table_info(game_circuit_runtime)').all() as { name: string }[];
      if (!columns.some((column) => column.name === 'is_paused')) {
        db.exec(`ALTER TABLE game_circuit_runtime
          ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0 CHECK (is_paused IN (0, 1))`);
      }
      if (!columns.some((column) => column.name === 'remaining_ms')) {
        db.exec(`ALTER TABLE game_circuit_runtime
          ADD COLUMN remaining_ms INTEGER NOT NULL DEFAULT 0 CHECK (remaining_ms >= 0)`);
      }
    },
  },
  {
    version: 21,
    up: () => {
      const columns = db.prepare('PRAGMA table_info(game_circuit_player_states)').all() as { name: string }[];
      if (!columns.some((column) => column.name === 'last_activity_at')) {
        db.exec(`ALTER TABLE game_circuit_player_states
          ADD COLUMN last_activity_at INTEGER NOT NULL DEFAULT 0 CHECK (last_activity_at >= 0)`);
      }
      db.exec(`
        UPDATE game_circuit_player_states
        SET last_activity_at = COALESCE(CAST(strftime('%s', updated_at) AS INTEGER) * 1000, 0)
        WHERE last_activity_at = 0
      `);
    },
  },
  {
    version: 22,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS game_circuit_assistance (
          game_session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          message_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('hint', 'retry')),
          message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 300),
          teacher_name TEXT NOT NULL,
          sent_at INTEGER NOT NULL CHECK (sent_at >= 0),
          delivered_at INTEGER CHECK (delivered_at IS NULL OR delivered_at >= sent_at),
          acknowledged_at INTEGER CHECK (acknowledged_at IS NULL OR acknowledged_at >= sent_at),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (game_session_id, student_id),
          UNIQUE (message_id)
        );
        CREATE INDEX IF NOT EXISTS idx_game_circuit_assistance_session
          ON game_circuit_assistance(game_session_id, student_id);
      `);
    },
  },
  {
    version: 23,
    up: () => {
      const columns = db.prepare('PRAGMA table_info(game_circuit_player_states)').all() as { name: string }[];
      if (!columns.some((column) => column.name === 'submission_attempts')) {
        db.exec(`ALTER TABLE game_circuit_player_states
          ADD COLUMN submission_attempts INTEGER NOT NULL DEFAULT 0 CHECK (submission_attempts >= 0)`);
      }
      if (!columns.some((column) => column.name === 'last_submission_at')) {
        db.exec(`ALTER TABLE game_circuit_player_states
          ADD COLUMN last_submission_at INTEGER CHECK (last_submission_at IS NULL OR last_submission_at >= 0)`);
      }
      if (!columns.some((column) => column.name === 'last_validation_code')) {
        db.exec(`ALTER TABLE game_circuit_player_states
          ADD COLUMN last_validation_code TEXT CHECK (last_validation_code IS NULL OR last_validation_code IN ('correct', 'invalid_data', 'wire_count', 'component_count', 'connection'))`);
      }
      if (!columns.some((column) => column.name === 'last_validation_feedback')) {
        db.exec(`ALTER TABLE game_circuit_player_states
          ADD COLUMN last_validation_feedback TEXT CHECK (last_validation_feedback IS NULL OR length(last_validation_feedback) <= 300)`);
      }
    },
  },
];

type SqlParam = string | number | bigint | null;

export function queryAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function queryOne<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function tx(fn: () => void): void {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function run(sql: string, ...params: SqlParam[]): void {
  db.prepare(sql).run(...params);
}

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  display_name: string;
  status: string;
  failed_attempts: number;
  must_change_password: number;
  student_code: string | null;
  dob: string | null;
  gender: string | null;
  hometown: string | null;
};

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export type PublicUser = {
  id: string;
  username: string;
  role: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
  studentCode: string | null;
  dob: string | null;
  gender: string | null;
  hometown: string | null;
};

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    status: row.status,
    mustChangePassword: row.must_change_password === 1,
    studentCode: row.student_code,
    dob: row.dob,
    gender: row.gender,
    hometown: row.hometown,
  };
}
