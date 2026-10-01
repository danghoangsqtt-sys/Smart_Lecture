import type { DatabaseSync } from 'node:sqlite';

export function migrateSharedTeachingSession(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(teaching_logs)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'shared_subject_id')) {
    db.exec('ALTER TABLE teaching_logs ADD COLUMN shared_subject_id TEXT REFERENCES shared_subjects(id)');
  }
  if (!columns.some((column) => column.name === 'shared_lesson_id')) {
    db.exec('ALTER TABLE teaching_logs ADD COLUMN shared_lesson_id TEXT REFERENCES shared_lessons(id)');
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_teaching_logs_shared_subject
    ON teaching_logs(shared_subject_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_teaching_logs_shared_lesson
    ON teaching_logs(shared_lesson_id, started_at DESC);`);
}
