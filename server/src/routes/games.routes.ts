import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, queryAll, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';
import { createCsvBuffer, createXlsxBuffer, type SpreadsheetRows } from '../utils/spreadsheet.js';

const router = Router();
router.use(requireAuth);

function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const storedCircuitDebriefSchema = z
  .object({
    type: z.literal('circuit_learning_debrief'),
    version: z.literal(1),
    completedCount: z.number().int().min(0).max(100),
    totalChallenges: z.number().int().min(1).max(100),
    totalSubmissionAttempts: z.number().int().min(0).max(1_000_000),
    incorrectSubmissionAttempts: z.number().int().min(0).max(1_000_000),
  })
  .refine((detail) => detail.completedCount <= detail.totalChallenges, 'completedCount exceeds totalChallenges')
  .refine(
    (detail) => detail.incorrectSubmissionAttempts <= detail.totalSubmissionAttempts,
    'incorrectSubmissionAttempts exceeds totalSubmissionAttempts',
  );

interface StoredCircuitResultRow {
  student_id: string;
  display_name: string;
  score: number;
  detail_json: string;
}

function parseStoredCircuitDetail(raw: string) {
  try {
    const parsed = storedCircuitDebriefSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readPersistedCircuitDebrief(sessionId: string) {
  const rows = db.prepare(
    `SELECT gr.student_id, u.display_name, gr.score, gr.detail_json
     FROM game_results gr
     JOIN users u ON u.id = gr.student_id
     WHERE gr.game_session_id = ?
     ORDER BY gr.rank, u.display_name, gr.student_id`,
  ).all(sessionId) as unknown as StoredCircuitResultRow[];
  const learners = rows.flatMap((row) => {
    const detail = parseStoredCircuitDetail(row.detail_json);
    if (!detail) return [];
    return [{
      userId: row.student_id,
      name: row.display_name,
      completedCount: detail.completedCount,
      totalChallenges: detail.totalChallenges,
      totalSubmissionAttempts: detail.totalSubmissionAttempts,
      incorrectSubmissionAttempts: detail.incorrectSubmissionAttempts,
      score: Number.isFinite(row.score) ? row.score : 0,
    }];
  });
  if (learners.length === 0) return null;
  const totalCompletions = learners.reduce((sum, learner) => sum + learner.completedCount, 0);
  const totalPossible = learners.reduce((sum, learner) => sum + learner.totalChallenges, 0);
  return {
    summary: {
      learnerCount: learners.length,
      completedAllCount: learners.filter((learner) => learner.completedCount === learner.totalChallenges).length,
      totalCompletions,
      totalPossible,
      totalSubmissionAttempts: learners.reduce((sum, learner) => sum + learner.totalSubmissionAttempts, 0),
      incorrectSubmissionAttempts: learners.reduce((sum, learner) => sum + learner.incorrectSubmissionAttempts, 0),
      completionRate: totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0,
    },
    learners,
  };
}

function getCircuitDebriefOrThrow(row: GameRow, req: AuthedRequest) {
  assertHost(row, req);
  if (row.game_type !== 'circuit_simulate') throw new HttpError(400, 'WRONG_GAME_TYPE', 'Phiên này không phải game mô phỏng mạch');
  if (row.status !== 'finished') throw new HttpError(400, 'NOT_FINISHED', 'Game chưa kết thúc');
  const debrief = readPersistedCircuitDebrief(row.id);
  if (!debrief) throw new HttpError(404, 'DEBRIEF_NOT_AVAILABLE', 'Phiên chưa có tổng kết học tập mạch hợp lệ');
  return debrief;
}

function spreadsheetSafeText(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function circuitDebriefExportRows(row: GameRow, debrief: NonNullable<ReturnType<typeof readPersistedCircuitDebrief>>): SpreadsheetRows {
  const session = serializeSession(row);
  const summary = debrief.summary;
  return [
    ['SMARTLECTURE — TỔNG KẾT HỌC TẬP MẠCH'],
    ['Tên phiên', spreadsheetSafeText(session.config.title || 'Mô phỏng mạch')],
    ['Mã phiên', row.id],
    ['Mã phòng', spreadsheetSafeText(row.room_code)],
    ['Kết thúc', row.finished_at ?? ''],
    [],
    ['TỔNG QUAN'],
    ['Số học viên', summary.learnerCount],
    ['Hoàn thành toàn bộ', summary.completedAllCount],
    ['Tổng lượt bài hoàn thành', summary.totalCompletions],
    ['Tổng lượt bài có thể', summary.totalPossible],
    ['Tỷ lệ hoàn thành (%)', summary.completionRate],
    ['Tổng lượt nộp', summary.totalSubmissionAttempts],
    ['Lượt chưa đạt', summary.incorrectSubmissionAttempts],
    [],
    ['STT', 'Học viên', 'Bài hoàn thành', 'Tổng bài', 'Lượt nộp', 'Lượt chưa đạt', 'Điểm'],
    ...debrief.learners.map((learner, index) => [
      index + 1,
      spreadsheetSafeText(learner.name),
      learner.completedCount,
      learner.totalChallenges,
      learner.totalSubmissionAttempts,
      learner.incorrectSubmissionAttempts,
      learner.score,
    ]),
  ];
}

router.post(
  '/games',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = z
      .object({
        gameType: z.enum([
          'quick_quiz', 'tug_of_war', 'math_race', 'hand_raise', 'crossword',
          'bingo', 'memory_match', 'word_scramble', 'quiz_show',
          'circuit_draw', 'circuit_simulate',
        ]),
        title: z.string().max(200).default('Trò chơi'),
        questionIds: z.array(z.string()).min(1).max(50).optional(),
        secondsPerQuestion: z.number().int().min(5).max(120).default(20),
        durationSec: z.number().int().min(30).max(600).default(120),
        difficulty: z.number().int().min(1).max(3).default(1),
        pointsPerCorrect: z.union([z.literal(0.25), z.literal(0.5), z.literal(1)]).optional(),
        classId: z.string().optional(),
        subjectId: z.string().optional(),
        lockOnStart: z.boolean().default(false),
        puzzle: z
          .object({
            keyword: z.string().min(2).max(10).regex(/^[A-Za-zÀ-ỹà-ỹ\s]+$/),
            rows: z
              .array(z.object({ clue: z.string().min(3).max(500), word: z.string().min(2).max(40) }))
              .min(2)
              .max(10),
          })
          .optional(),
        circuitTemplate: z
          .object({
            components: z
              .array(
                z.object({
                  id: z.string().max(60),
                  type: z.string().max(40),
                  x: z.number(),
                  y: z.number(),
                  rot: z.number().default(0),
                  props: z.record(z.string(), z.unknown()).default({}),
                })
              )
              .max(80),
            wires: z
              .array(z.object({ id: z.string().max(60), from: z.string().max(120), to: z.string().max(120) }))
              .max(200),
          })
          .optional(),
        simulateChallenges: z
          .array(
            z.object({
              title: z.string().min(1).max(120),
              description: z.string().max(500).default(''),
              targetBehavior: z.string().max(300).default(''),
              points: z.number().int().min(10).max(1000).default(100),
              circuit: z
                .object({
                  components: z.array(
                    z.object({
                      id: z.string().max(60),
                      type: z.string().max(40),
                      x: z.number(),
                      y: z.number(),
                      rot: z.number().default(0),
                      props: z.record(z.string(), z.unknown()).default({}),
                    })
                  ).max(80),
                  wires: z.array(
                    z.object({ id: z.string().max(60), from: z.string().max(120), to: z.string().max(120) })
                  ).max(200),
                })
                .nullable()
                .optional(),
            })
          )
          .min(1)
          .max(10)
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Cấu hình game không hợp lệ');
    const d = parsed.data;
    if (d.classId) {
      const cls = getClassOrThrow(d.classId);
      if (!canManageClass(cls, authed.user)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n vá»›i lá»›p nÃ y');
    }
    if (d.subjectId) {
      const subject = db.prepare('SELECT class_id FROM subjects WHERE id = ?').get(d.subjectId) as { class_id: string } | undefined;
      if (!subject) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y mÃ´n há»c');
      if (d.classId && subject.class_id !== d.classId) throw new HttpError(400, 'BAD_INPUT', 'MÃ´n há»c khÃ´ng thuá»™c lá»›p Ä‘Ã£ chá»n');
      const cls = getClassOrThrow(subject.class_id);
      if (!canManageClass(cls, authed.user)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n vá»›i mÃ´n há»c nÃ y');
    }
    const NO_QUESTIONS: readonly string[] = ['math_race', 'crossword', 'bingo', 'memory_match', 'circuit_draw', 'circuit_simulate'];
    if (!NO_QUESTIONS.includes(d.gameType) && (!d.questionIds || d.questionIds.length === 0)) {
      throw new HttpError(400, 'BAD_INPUT', 'Game này cần ít nhất 1 câu hỏi');
    }
    if (d.questionIds?.length) {
      if (new Set(d.questionIds).size !== d.questionIds.length) throw new HttpError(400, 'BAD_QUESTIONS', 'Không được chọn trùng câu hỏi');
      const accessible = db
        .prepare(`SELECT COUNT(*) AS c FROM questions WHERE id IN (${d.questionIds.map(() => '?').join(',')}) AND (owner_id = ? OR is_public_bank = 1)`)
        .get(...d.questionIds, authed.user.id) as { c: number };
      if (accessible.c !== d.questionIds.length) {
        throw new HttpError(400, 'BAD_QUESTIONS', 'Một số câu hỏi không tồn tại hoặc bạn không có quyền sử dụng');
      }
    }
    if (d.gameType === 'crossword') {
      if (!d.puzzle) throw new HttpError(400, 'BAD_INPUT', 'Ô chữ cần dữ liệu puzzle');
      const key = d.puzzle.keyword.toUpperCase();
      if (d.puzzle.rows.length !== key.length) {
        throw new HttpError(400, 'BAD_INPUT', `Số hàng ngang (${d.puzzle.rows.length}) phải bằng độ dài từ khóa (${key.length})`);
      }
      for (let i = 0; i < d.puzzle.rows.length; i++) {
        const row = d.puzzle.rows[i];
        if (!row) continue;
        const word = row.word.toUpperCase().replace(/\s+/g, '');
        if (word[i] !== key[i]) {
          throw new HttpError(
            400,
            'BAD_CROSSWORD',
            `Hàng ngang ${i + 1}: chữ thứ ${i + 1} của "${word}" không khớp chữ cái "${key[i]}" của từ khóa`
          );
        }
      }
    }

    let roomCode = generateRoomCode();
    while (db.prepare('SELECT 1 FROM game_sessions WHERE room_code = ? AND status != ?').get(roomCode, 'finished')) {
      roomCode = generateRoomCode();
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO game_sessions (id, host_teacher_id, class_id, game_type, room_code, question_ids_json, config_json, subject_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      authed.user.id,
      d.classId ?? null,
      d.gameType,
      roomCode,
      JSON.stringify(d.questionIds ?? []),
      JSON.stringify({
        secondsPerQuestion: d.secondsPerQuestion,
        durationSec: d.durationSec,
        difficulty: d.difficulty,
        title: d.title,
        pointsPerCorrect: d.pointsPerCorrect ?? null,
        classId: d.classId ?? null,
        puzzle: d.puzzle ?? null,
        circuitTemplate: d.circuitTemplate ?? null,
        simulateChallenges: d.simulateChallenges ?? null,
        lockOnStart: d.lockOnStart,
      }),
      d.subjectId ?? null
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

router.get(
  '/games/mine/recent-circuit-debriefs',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = z.object({
      classId: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(10).default(5),
    }).safeParse(req.query);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Bộ lọc tổng kết không hợp lệ');
    if (parsed.data.classId) {
      const cls = getClassOrThrow(parsed.data.classId);
      if (!canManageClass(cls, authed.user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp này');
    }
    const scanLimit = Math.min(parsed.data.limit * 5, 50);
    const rows = db.prepare(
      `SELECT * FROM game_sessions
       WHERE host_teacher_id = ? AND game_type = 'circuit_simulate' AND status = 'finished'
         AND (? IS NULL OR class_id = ?)
       ORDER BY finished_at DESC, created_at DESC
       LIMIT ?`,
    ).all(
      authed.user.id,
      parsed.data.classId ?? null,
      parsed.data.classId ?? null,
      scanLimit,
    ) as unknown as GameRow[];
    const reports = rows.flatMap((row) => {
      const debrief = readPersistedCircuitDebrief(row.id);
      return debrief ? [{ session: serializeSession(row), finishedAt: row.finished_at, debrief }] : [];
    }).slice(0, parsed.data.limit);
    res.json({ reports });
  }),
);

router.get(
  '/games/:id/circuit-debrief',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const row = getGameOrThrow(String(req.params.id));
    const debrief = getCircuitDebriefOrThrow(row, req as AuthedRequest);
    res.json({ session: serializeSession(row), finishedAt: row.finished_at, debrief });
  }),
);

router.get(
  '/games/:id/circuit-debrief/export',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const parsed = z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx') }).safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Định dạng xuất phải là csv hoặc xlsx');
    const row = getGameOrThrow(String(req.params.id));
    const debrief = getCircuitDebriefOrThrow(row, req as AuthedRequest);
    const rows = circuitDebriefExportRows(row, debrief);
    const format = parsed.data.format;
    const buffer = format === 'csv'
      ? createCsvBuffer(rows)
      : await createXlsxBuffer('Tổng kết mạch', rows, [8, 30, 18, 14, 14, 16, 12]);
    const safeSessionId = row.id.replace(/[^A-Za-z0-9_-]/gu, '_');
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tong-ket-mach-${safeSessionId}.${format}"`);
    res.send(buffer);
  }),
);

router.post(
  '/games/random-pick',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = z
      .object({
        classId: z.string(),
        count: z.union([z.literal(1), z.literal(2)]).default(1),
        excludeIds: z.array(z.string()).max(100).default([]),
        examId: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Tham số không hợp lệ');
    const cls = getClassOrThrow(parsed.data.classId);
    if (!canManageClass(cls, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp này');
    const students = db
      .prepare(
        `SELECT u.id, u.display_name FROM enrollments e JOIN users u ON u.id = e.student_id
         WHERE e.class_id = ? AND u.status = 'active'`
      )
      .all(cls.id) as { id: string; display_name: string }[];
    let pool = students.filter((s) => !parsed.data.excludeIds.includes(s.id));

    let pendingQuestion: { content: string; options: string[] } | null = null;
    if (parsed.data.examId) {
      const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(parsed.data.examId) as GameRow | undefined;
      if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy bài tập');
      const config = JSON.parse(exam.config_json || '{}') as { classId?: string | null; class_id?: string | null };
      const examClassId = config.class_id ?? config.classId ?? null;
      if (examClassId !== cls.id) throw new HttpError(403, 'FORBIDDEN', 'Bài tập không thuộc lớp đã chọn');
      const submitted = queryAll<{ student_id: string }>(
        "SELECT DISTINCT student_id FROM exam_results WHERE exam_id = ? AND status = 'submitted'",
        exam.id
      ).map((r) => r.student_id);
      const notSubmitted = pool.filter((s) => !submitted.includes(s.id));
      if (notSubmitted.length > 0) pool = notSubmitted;

      const ids = JSON.parse(exam.question_ids_json) as string[];
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const rows = queryAll<{ content: string; type: string; options_json: string }>(
          `SELECT content, type, options_json FROM questions WHERE id IN (${placeholders})`,
          ...ids
        );
        const qPick = rows[Math.floor(Math.random() * rows.length)];
        if (qPick) {
          pendingQuestion = {
            content: qPick.content,
            options:
              qPick.type === 'mcq'
                ? (JSON.parse(qPick.options_json) as string[]).map((o) => o.replace(/^([A-D])[\.\:\)]\s+/, ''))
                : [],
          };
        }
      }
    }

    const source = pool.length >= parsed.data.count ? pool : students;
    if (source.length === 0) throw new HttpError(400, 'EMPTY_CLASS', 'Lớp chưa có học viên');
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
      preferredUnsubmitted: parsed.data.examId ? pool !== students || pool.length < students.length : false,
      question: pendingQuestion,
    });
  })
);

router.post(
  '/games/:id/bonus',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const row = getGameOrThrow(String(req.params.id));
    assertHost(row, req as AuthedRequest);
    const parsed = z
      .object({
        first: z.number().min(0).max(5).default(0),
        second: z.number().min(0).max(5).default(0),
        third: z.number().min(0).max(5).default(0),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Điểm thưởng không hợp lệ (0–5)');
    if (row.status !== 'finished') throw new HttpError(400, 'NOT_FINISHED', 'Game chưa kết thúc');

    const already = queryAll<{ student_id: string }>(
      'SELECT student_id FROM game_results WHERE game_session_id = ? AND approved_into_grades = 1',
      row.id
    );
    if (already.length > 0) {
      throw new HttpError(409, 'ALREADY_APPLIED', 'Đã cộng thưởng cho phiên này trước đó');
    }

    const cfg = JSON.parse(row.config_json) as { classId?: string | null };
    const classId = cfg.classId ?? null;
    if (!classId) throw new HttpError(400, 'NO_CLASS', 'Phiên game không gắn với lớp — không thể cộng điểm KTTX');

    const results = queryAll<{ student_id: string; rank: number }>(
      'SELECT student_id, rank FROM game_results WHERE game_session_id = ? ORDER BY rank LIMIT 3',
      row.id
    );
    const bonusFor = (rank: number): number => {
      if (rank === 1) return parsed.data.first ?? 0;
      if (rank === 2) return parsed.data.second ?? 0;
      if (rank === 3) return parsed.data.third ?? 0;
      return 0;
    };

    let applied = 0;
    tx(() => {
      for (const r of results) {
        const delta = bonusFor(r.rank);
        if (delta <= 0 || !r.student_id) continue;
        const cur = db.prepare('SELECT kttx FROM grades WHERE class_id = ? AND student_id = ?').get(classId, r.student_id) as
          | { kttx: number | null }
          | undefined;
        const next = Math.min(10, Math.round(((cur?.kttx ?? 0) + delta) * 100) / 100);
        db.prepare(
          `INSERT INTO grades (class_id, student_id, kttx, updated_at) VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(class_id, student_id) DO UPDATE SET kttx = excluded.kttx, updated_at = excluded.updated_at`
        ).run(classId, r.student_id, next);
        db.prepare('UPDATE game_results SET approved_into_grades = 1 WHERE game_session_id = ? AND student_id = ? AND rank = ?').run(
          row.id,
          r.student_id,
          r.rank
        );
        applied++;
      }
    });

    res.json({ ok: true, applied });
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
  class_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export function getGameOrThrow(id: string): GameRow {
  const row = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(id) as GameRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy phiên game');
  return row;
}

export function assertHost(game: GameRow, req: AuthedRequest): void {
  if ((req.user?.role !== 'admin') && game.host_teacher_id !== req.user?.id) {
    throw new HttpError(403, 'FORBIDDEN', 'Chỉ người tạo game mới điều khiển được');
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
