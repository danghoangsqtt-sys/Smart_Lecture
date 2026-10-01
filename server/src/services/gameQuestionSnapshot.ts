import { db, queryAll, tx } from '../db/connection.js';
import type { GameQuestion } from '../realtime/gameTypes.js';

type QuestionRow = { id: string; type: string; content: string; options_json: string; correct_answer: string };

export function loadBankGameQuestions(ids: string[], requireAll = true): GameQuestion[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = queryAll<QuestionRow>(
    `SELECT id, type, content, options_json, correct_answer FROM questions WHERE id IN (${placeholders})`, ...ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (requireAll && ids.some((id) => !byId.has(id))) throw new Error('Một số câu hỏi của game không còn trong ngân hàng');
  return ids.filter((id) => byId.has(id)).map((id) => {
    const row = byId.get(id)!;
    if (row.type === 'fill') return { id, type: 'fill' as const, content: row.content, correctText: row.correct_answer };
    const options = (JSON.parse(row.options_json) as string[]).map((option) => option.replace(/^([A-D])[\.:\)]\s+/, ''));
    let correctIdx = /^[A-D]$/.test(row.correct_answer) ? row.correct_answer.charCodeAt(0) - 65 : 0;
    if (correctIdx < 0 || correctIdx >= options.length) correctIdx = 0;
    return { id, type: 'mcq' as const, content: row.content, options, correctIdx };
  });
}

export function startGameWithSnapshot(sessionId: string): GameQuestion[] {
  let snapshot: GameQuestion[] = [];
  tx(() => {
    const session = db.prepare('SELECT question_ids_json, game_type, status FROM game_sessions WHERE id = ?')
      .get(sessionId) as { question_ids_json: string; game_type: string; status: string } | undefined;
    if (!session || session.status !== 'lobby') throw new Error('Phiên game không còn ở sảnh chờ');
    const ids = JSON.parse(session.question_ids_json) as string[];
    snapshot = session.game_type === 'math_race' ? [] : loadBankGameQuestions(ids);
    const updated = db.prepare(`UPDATE game_sessions SET status = 'running', started_at = datetime('now'),
      questions_snapshot_json = ? WHERE id = ? AND status = 'lobby'`)
      .run(JSON.stringify(snapshot), sessionId);
    if (updated.changes !== 1) throw new Error('Không thể bắt đầu game');
  });
  return snapshot;
}
