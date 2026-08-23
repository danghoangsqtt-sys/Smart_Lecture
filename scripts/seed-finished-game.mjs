import { DatabaseSync } from 'node:sqlite';

const [sessionId, s1, s2, s3] = process.argv.slice(2);
if (!sessionId || !s1 || !s2 || !s3) {
  console.error('usage: node seed-finished-game.mjs <sessionId> <studentId1> <studentId2> <studentId3>');
  process.exit(1);
}

const db = new DatabaseSync('E:/data/2.MyProject/2025/Smart_Lecture/data/smart-lecture.db');
const target = sessionId.replace(/'/g, '');

db.exec(`UPDATE game_sessions SET status = 'finished', finished_at = datetime('now') WHERE id = '${target}'`);
const ins = db.prepare(
  'INSERT OR IGNORE INTO game_results (game_session_id, student_id, score, rank) VALUES (?, ?, ?, ?)'
);
ins.run(target, s1, 12, 1);
ins.run(target, s2, 9, 2);
ins.run(target, s3, 7, 3);
console.log('seeded');
