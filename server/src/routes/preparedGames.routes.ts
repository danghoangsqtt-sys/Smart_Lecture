import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

interface PreparedGameRow {
  id: string;
  teacher_id: string;
  subject_id: string | null;
  class_id: string | null;
  game_type: string;
  title: string;
  config_json: string;
  question_ids_json: string;
  created_at: string;
  last_used_at: string | null;
}

function getPreparedGameOrThrow(id: string): PreparedGameRow {
  const row = db.prepare('SELECT * FROM prepared_games WHERE id = ?').get(id) as PreparedGameRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy game đã chuẩn bị');
  return row;
}

router.get(
  '/prepared-games',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const subjectId = req.query.subjectId as string | undefined;
    const classId = req.query.classId as string | undefined;
    let sql = 'SELECT * FROM prepared_games WHERE teacher_id = ?';
    const params: (string | number)[] = [user.id];
    if (subjectId) {
      sql += ' AND subject_id = ?';
      params.push(subjectId);
    }
    if (classId) {
      sql += ' AND class_id = ?';
      params.push(classId);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const games = db.prepare(sql).all(...params) as unknown as PreparedGameRow[];
    res.json({
      preparedGames: games.map(g => ({
        id: g.id,
        teacherId: g.teacher_id,
        subjectId: g.subject_id,
        classId: g.class_id,
        gameType: g.game_type,
        title: g.title,
        config: JSON.parse(g.config_json || '{}'),
        questionIds: JSON.parse(g.question_ids_json || '[]'),
        createdAt: g.created_at,
        lastUsedAt: g.last_used_at,
      })),
    });
  })
);

router.get(
  '/prepared-games/:gameId',
  h(async (req, res) => {
    const game = getPreparedGameOrThrow(String(req.params.gameId));
    const user = (req as AuthedRequest).user!;
    if (game.teacher_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem');
    res.json({
      preparedGame: {
        id: game.id,
        teacherId: game.teacher_id,
        subjectId: game.subject_id,
        classId: game.class_id,
        gameType: game.game_type,
        title: game.title,
        config: JSON.parse(game.config_json || '{}'),
        questionIds: JSON.parse(game.question_ids_json || '[]'),
        createdAt: game.created_at,
        lastUsedAt: game.last_used_at,
      },
    });
  })
);

const createGameSchema = z.object({
  subjectId: z.string().nullable().optional(),
  classId: z.string().nullable().optional(),
  gameType: z.enum([
    'quick_quiz', 'tug_of_war', 'math_race', 'hand_raise', 'crossword',
    'bingo', 'memory_match', 'word_scramble', 'quiz_show', 'circuit_draw', 'circuit_simulate',
  ]),
  title: z.string().min(1).max(200),
  config: z.record(z.string(), z.unknown()).default({}),
  questionIds: z.array(z.string()).default([]),
});

router.post(
  '/prepared-games',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const parsed = createGameSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const id = randomUUID();
    db.prepare(
      `INSERT INTO prepared_games (id, teacher_id, subject_id, class_id, game_type, title, config_json, question_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      parsed.data.subjectId ?? null,
      parsed.data.classId ?? null,
      parsed.data.gameType,
      parsed.data.title,
      JSON.stringify(parsed.data.config),
      JSON.stringify(parsed.data.questionIds)
    );
    res.status(201).json({ id });
  })
);

router.patch(
  '/prepared-games/:gameId',
  h(async (req, res) => {
    const game = getPreparedGameOrThrow(String(req.params.gameId));
    const user = (req as AuthedRequest).user!;
    if (game.teacher_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa');
    const parsed = createGameSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    db.prepare(
      `UPDATE prepared_games SET subject_id = ?, class_id = ?, game_type = ?, title = ?, config_json = ?, question_ids_json = ? WHERE id = ?`
    ).run(
      parsed.data.subjectId ?? game.subject_id,
      parsed.data.classId ?? game.class_id,
      parsed.data.gameType ?? game.game_type,
      parsed.data.title ?? game.title,
      JSON.stringify(parsed.data.config ?? JSON.parse(game.config_json || '{}')),
      JSON.stringify(parsed.data.questionIds ?? JSON.parse(game.question_ids_json || '[]')),
      game.id
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/prepared-games/:gameId',
  h(async (req, res) => {
    const game = getPreparedGameOrThrow(String(req.params.gameId));
    const user = (req as AuthedRequest).user!;
    if (game.teacher_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa');
    db.prepare('DELETE FROM prepared_games WHERE id = ?').run(game.id);
    res.json({ ok: true });
  })
);

router.post(
  '/prepared-games/:gameId/launch',
  h(async (req, res) => {
    const game = getPreparedGameOrThrow(String(req.params.gameId));
    const user = (req as AuthedRequest).user!;
    if (game.teacher_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền chạy game');
    const { classId, subjectId } = z.object({ classId: z.string().optional(), subjectId: z.string().optional() }).parse(req.body);
    const launchClassId = game.class_id ?? classId ?? null;
    const launchSubjectId = game.subject_id ?? subjectId ?? null;
    if (launchClassId) {
      const cls = getClassOrThrow(launchClassId);
      if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp này');
    }
    if (launchSubjectId) {
      const subject = db.prepare('SELECT class_id FROM subjects WHERE id = ?').get(launchSubjectId) as { class_id: string } | undefined;
      if (!subject) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy môn học');
      if (launchClassId && subject.class_id !== launchClassId) throw new HttpError(400, 'BAD_INPUT', 'Môn học không thuộc lớp đã chọn');
      const cls = getClassOrThrow(subject.class_id);
      if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với môn học này');
    }
    const config = JSON.parse(game.config_json || '{}');
    const questionIds = JSON.parse(game.question_ids_json || '[]');
    const id = randomUUID();
    let roomCode = String(Math.floor(100000 + Math.random() * 900000));
    while (db.prepare("SELECT 1 FROM game_sessions WHERE room_code = ? AND status != 'finished'").get(roomCode)) {
      roomCode = String(Math.floor(100000 + Math.random() * 900000));
    }
    db.prepare(
      `INSERT INTO game_sessions (id, host_teacher_id, game_type, room_code, exam_id, question_ids_json, config_json, status, subject_id, class_id, room_state, participant_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'lobby', ?, ?, 'lobby', 0)`
    ).run(
      id,
      user.id,
      game.game_type,
      roomCode,
      null,
      JSON.stringify(questionIds),
      JSON.stringify(config),
      launchSubjectId,
      launchClassId
    );
    db.prepare('UPDATE prepared_games SET last_used_at = datetime(\'now\') WHERE id = ?').run(game.id);
    res.status(201).json({ id, roomCode });
  })
);

export default router;
