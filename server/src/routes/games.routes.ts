import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post(
  '/games',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = z
      .object({
        gameType: z.enum(['quick_quiz', 'tug_of_war', 'math_race']),
        title: z.string().max(200).default('Trò chơi'),
        questionIds: z.array(z.string()).min(1).max(50).optional(),
        secondsPerQuestion: z.number().int().min(5).max(120).default(20),
        durationSec: z.number().int().min(30).max(600).default(120),
        difficulty: z.number().int().min(1).max(3).default(1),
      })
      .safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Cấu hình game không hợp lệ');
    if (parsed.data.gameType !== 'math_race' && (!parsed.data.questionIds || parsed.data.questionIds.length === 0)) {
      throw new HttpError(400, 'BAD_INPUT', 'Game này cần ít nhất 1 câu hỏi');
    }
    let roomCode = generateRoomCode();
    while (db.prepare('SELECT 1 FROM game_sessions WHERE room_code = ? AND status != ?').get(roomCode, 'finished')) {
      roomCode = generateRoomCode();
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO game_sessions (id, host_teacher_id, game_type, room_code, question_ids_json, config_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      authed.user.id,
      parsed.data.gameType,
      roomCode,
      JSON.stringify(parsed.data.questionIds ?? []),
      JSON.stringify({
        secondsPerQuestion: parsed.data.secondsPerQuestion,
        durationSec: parsed.data.durationSec,
        difficulty: parsed.data.difficulty,
        title: parsed.data.title,
      })
    );
    res.status(201).json({ id, roomCode });
  })
);

router.get(
  '/games/:id',
  h(async (req, res) => {
    const row = getGameOrThrow(String(req.params.id));
    res.json({ session: serializeSession(row) });
  })
);

router.post(
  '/games/:id/cancel',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const row = getGameOrThrow(String(req.params.id));
    assertHost(row, req as AuthedRequest);
    db.prepare("UPDATE game_sessions SET status = 'finished', finished_at = datetime('now') WHERE id = ?").run(row.id);
    res.json({ ok: true });
  })
);

router.get(
  '/games/mine/active',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const rows = db
      .prepare("SELECT * FROM game_sessions WHERE host_teacher_id = ? AND status IN ('lobby','running') ORDER BY created_at DESC LIMIT 10")
      .all(authed.user!.id) as unknown as GameRow[];
    res.json({ sessions: rows.map(serializeSession) });
  })
);

router.post(
  '/games/random-pick',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = z
      .object({ classId: z.string(), count: z.union([z.literal(1), z.literal(2)]).default(1), excludeIds: z.array(z.string()).max(100).default([]) })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Tham sá»‘ khÃ´ng há»£p lá»‡');
    const cls = getClassOrThrow(parsed.data.classId);
    if (!canManageClass(cls, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n vá»›i lá»›p nÃ y');
    const students = db
      .prepare(
        `SELECT u.id, u.display_name FROM enrollments e JOIN users u ON u.id = e.student_id
         WHERE e.class_id = ? AND u.status = 'active'`
      )
      .all(cls.id) as { id: string; display_name: string }[];
    const pool = students.filter((s) => !parsed.data.excludeIds.includes(s.id));
    const source = pool.length >= parsed.data.count ? pool : students;
    if (source.length === 0) throw new HttpError(400, 'EMPTY_CLASS', 'Lá»›p chÆ°a cÃ³ há»c viÃªn');
    const shuffled = [...source];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmpI = shuffled[i];
      const tmpJ = shuffled[j];
      if (tmpI !== undefined && tmpJ !== undefined) {
        shuffled[i] = tmpJ;
        shuffled[j] = tmpI;
      }
    }
    const picked = shuffled.slice(0, parsed.data.count);
    res.json({
      picked: picked.map((p) => ({ id: p.id, displayName: p.display_name })),
      poolSize: students.length,
    });
  })
);

export interface GameRow {
  id: string;
  host_teacher_id: string;
  game_type: string;
  room_code: string;
  exam_id: string | null;
  question_ids_json: string;
  config_json: string;
  status: string;
  current_question_index: number;
}

export function getGameOrThrow(id: string): GameRow {
  const row = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(id) as GameRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y phiÃªn game');
  return row;
}

export function assertHost(game: GameRow, req: AuthedRequest): void {
  if ((req.user?.role !== 'admin') && game.host_teacher_id !== req.user?.id) {
    throw new HttpError(403, 'FORBIDDEN', 'Chá»‰ ngÆ°á»i táº¡o game má»›i Ä‘iá»u khiá»ƒn Ä‘Æ°á»£c');
  }
}

export function serializeSession(g: GameRow) {
  const cfg = JSON.parse(g.config_json) as { title?: string; secondsPerQuestion?: number };
  return {
    id: g.id,
    gameType: g.game_type,
    roomCode: g.room_code,
    status: g.status,
    currentIndex: g.current_question_index,
    questionCount: (JSON.parse(g.question_ids_json) as string[]).length,
    config: { title: cfg.title ?? '', secondsPerQuestion: cfg.secondsPerQuestion ?? 20 },
  };
}

export default router;
