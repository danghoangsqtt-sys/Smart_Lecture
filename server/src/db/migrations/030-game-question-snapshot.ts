import type { DatabaseSync } from 'node:sqlite';

export function migrateGameQuestionSnapshot(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(game_sessions)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'questions_snapshot_json')) {
    db.exec('ALTER TABLE game_sessions ADD COLUMN questions_snapshot_json TEXT');
  }
}
