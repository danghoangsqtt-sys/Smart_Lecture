import { Router, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, queryAll, queryOne } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { generatePaper, type BankQuestion, type PaperQuestion, type AnswerKeyEntry } from '../services/examEngine.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);

interface ExamRow {
  id: string;
  creator_id: string;
  title: string;
  duration_min: number;
  question_ids_json: string;
  config_json: string;
  status: string;
}

interface ExamConfig {
  start_at?: string | null;
  end_at?: string | null;
  password?: string;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  max_attempts?: number;
  purpose?: 'online_test' | 'homework';
  class_id?: string | null;
}

interface AttemptDetail {
  questions: PaperQuestion[];
  key: Record<string, AnswerKeyEntry>;
  answers: Record<string, string>;
  perQuestion: Record<string, { s: string | null; c: string | null; k: boolean | 'pending'; essayScore?: number }>;
  deadlineAt?: string;
}

interface AttemptRow {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  remaining_sec: number;
  saved_answers_json: string;
  score: number | null;
  red_flags: number;
  answers_detail_json: string;
  updated_at: string;
}

function getConfig(exam: ExamRow): ExamConfig {
  try {
    return JSON.parse(exam.config_json) as ExamConfig;
  } catch {
    return {};
  }
}

function getAttemptOrThrow(id: string, userId: string): AttemptRow {
  const row = queryOne<AttemptRow>('SELECT * FROM exam_results WHERE id = ?', id);
  if (!row || row.student_id !== userId) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy bài làm');
  return row;
}

function canManageExam(exam: ExamRow, user: NonNullable<AuthedRequest['user']>): boolean {
  return user.role === 'admin' || exam.creator_id === user.id;
}

function serializeExam(exam: ExamRow) {
  const cfg = getConfig(exam);
  const count = db.prepare('SELECT COUNT(*) AS c FROM exam_results WHERE exam_id = ?').get(exam.id) as { c: number };
  return {
    id: exam.id,
    title: exam.title,
    durationMin: exam.duration_min,
    questionCount: (JSON.parse(exam.question_ids_json) as string[]).length,
    status: exam.status,
    config: {
      startAt: cfg.start_at ?? null,
      endAt: cfg.end_at ?? null,
      hasPassword: !!cfg.password,
      shuffleQuestions: cfg.shuffle_questions ?? true,
      shuffleOptions: cfg.shuffle_options ?? true,
      maxAttempts: cfg.max_attempts ?? 1,
      purpose: cfg.purpose ?? 'online_test',
      classId: cfg.class_id ?? null,
    },
    attemptCount: count.c,
  };
}

const upsertSchema = z.object({
  title: z.string().min(1).max(200),
  durationMin: z.number().int().min(1).max(300),
  questionIds: z.array(z.string()).min(1).max(200),
  config: z
    .object({
      start_at: z.string().nullable().optional(),
      end_at: z.string().nullable().optional(),
      password: z.string().max(50).optional(),
      shuffle_questions: z.boolean().optional(),
      shuffle_options: z.boolean().optional(),
      max_attempts: z.number().int().min(1).max(99).optional(),
      purpose: z.enum(['online_test', 'homework']).optional(),
      class_id: z.string().nullable().optional(),
    })
    .default({}),
});

router.get(
  '/exams/mine',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const rows = db
      .prepare('SELECT * FROM exams WHERE creator_id = ? ORDER BY created_at DESC')
      .all(authed.user!.id) as unknown as ExamRow[];
    res.json({ exams: rows.map(serializeExam) });
  })
);

router.post(
  '/exams',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Thông tin đề thi không hợp lệ');
    if (new Set(parsed.data.questionIds).size !== parsed.data.questionIds.length) {
      throw new HttpError(400, 'BAD_QUESTIONS', 'Không được chọn trùng câu hỏi');
    }
    const accessible = db
      .prepare(`SELECT COUNT(*) AS c FROM questions WHERE id IN (${parsed.data.questionIds.map(() => '?').join(',')}) AND (owner_id = ? OR is_public_bank = 1)`)
      .get(...parsed.data.questionIds, authed.user.id) as { c: number };
    if (accessible.c !== parsed.data.questionIds.length) {
      throw new HttpError(400, 'BAD_QUESTIONS', 'Một số câu hỏi không tồn tại hoặc bạn không có quyền sử dụng');
    }
    if (parsed.data.config.class_id) {
      const cls = getClassOrThrow(parsed.data.config.class_id);
      if (!canManageClass(cls, authed.user)) {
        throw new HttpError(403, 'FORBIDDEN', 'Không có quyền giao đề cho lớp này');
      }
    }
    const id = randomUUID();
    db.prepare(
      'INSERT INTO exams (id, creator_id, title, duration_min, question_ids_json, config_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      authed.user.id,
      parsed.data.title,
      parsed.data.durationMin,
      JSON.stringify(parsed.data.questionIds),
      JSON.stringify(parsed.data.config),
      'published'
    );
    res.status(201).json({ id });
  })
);

router.patch(
  '/exams/:id/status',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(String(req.params.id)) as ExamRow | undefined;
    if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy đề');
    if (!canManageExam(exam, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const status = z.enum(['published', 'closed']).safeParse(req.body?.status);
    if (!status.success) throw new HttpError(400, 'BAD_INPUT', 'Trạng thái không hợp lệ');
    db.prepare('UPDATE exams SET status = ? WHERE id = ?').run(status.data, exam.id);
    res.json({ ok: true });
  })
);

router.delete(
  '/exams/:id',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(String(req.params.id)) as ExamRow | undefined;
    if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy đề');
    if (!canManageExam(exam, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    db.prepare('DELETE FROM exams WHERE id = ?').run(exam.id);
    res.json({ ok: true });
  })
);

router.get(
  '/exams/:id/board-questions',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(String(req.params.id)) as ExamRow | undefined;
    if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy đề');
    if (!canManageExam(exam, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const ids = JSON.parse(exam.question_ids_json) as string[];
    if (ids.length === 0) {
      res.json({ questions: [] });
      return;
    }
    const placeholders = ids.map(() => '?').join(',');
    const rows = queryAll<{ id: string; type: string; content: string; options_json: string }>(
      `SELECT id, type, content, options_json FROM questions WHERE id IN (${placeholders})`,
      ...ids
    );
    res.json({
      questions: rows.map((r) => ({
        id: r.id,
        type: r.type,
        content: r.content,
        options:
          r.type === 'mcq'
            ? (JSON.parse(r.options_json) as string[]).map((o) => o.replace(/^([A-D])[\.\:\)]\s+/, ''))
            : [],
      })),
    });
  })
);

router.get(
  '/exams/:id/print-data',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(String(req.params.id)) as ExamRow | undefined;
    if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy đề');
    if (!canManageExam(exam, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    const ids = JSON.parse(exam.question_ids_json) as string[];
    if (ids.length === 0) {
      res.json({ exam: { title: exam.title, durationMin: exam.duration_min }, questions: [], key: [] });
      return;
    }
    const placeholders = ids.map(() => '?').join(',');
    const rows = queryAll<BankQuestion>(`SELECT * FROM questions WHERE id IN (${placeholders})`, ...ids);
    const orderMap = new Map(ids.map((qid, i) => [qid, i]));
    const sorted = [...rows].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    const paper = generatePaper(sorted, { shuffleQuestions: false, shuffleOptions: false });
    res.json({
      exam: { title: exam.title, durationMin: exam.duration_min },
      questions: paper.questions,
      key: Object.entries(paper.key).map(([qid, k]) => ({
        no: paper.questions.findIndex((q) => q.id === qid) + 1,
        type: k.type,
        letter: k.letter,
        correctText: k.correctText,
      })),
    });
  })
);

router.get(
  '/my-results',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const rows = queryAll<{ exam_title: string; status: string; score: number | null; submitted_at: string | null; red_flags: number }>(
      `SELECT e.title AS exam_title, r.status, r.score, r.submitted_at, r.red_flags
       FROM exam_results r JOIN exams e ON e.id = r.exam_id
       WHERE r.student_id = ? ORDER BY r.submitted_at DESC LIMIT 100`,
      authed.user!.id
    );
    res.json({
      results: rows.map((r) => ({
        examTitle: r.exam_title,
        status: r.status,
        score: r.score,
        submittedAt: r.submitted_at,
        redFlags: r.red_flags,
      })),
    });
  })
);

router.get(
  '/exams/available',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const user = authed.user!;
    if (user.role !== 'student') throw new HttpError(403, 'FORBIDDEN', 'Chỉ học viên mới có danh sách này');
    const wantedPurpose = req.query.purpose === 'homework' ? 'homework' : 'online_test';
    const enrolledIds = (
      queryAll<{ class_id: string }>('SELECT class_id FROM enrollments WHERE student_id = ?', user.id)
    ).map((e) => e.class_id);
    const rows = db.prepare("SELECT * FROM exams WHERE status = 'published' ORDER BY created_at DESC").all() as unknown as ExamRow[];
    const now = Date.now();
    const visible = rows.filter((r) => {
      const cfg = getConfig(r);
      if ((cfg.purpose ?? 'online_test') !== wantedPurpose) return false;
      if (!cfg.class_id || !enrolledIds.includes(cfg.class_id)) return false;
      if (cfg.end_at && new Date(cfg.end_at).getTime() < now) return false;
      return true;
    });
    res.json({
      exams: visible.map((r) => {
        const s = serializeExam(r);
        const attemptsUsed = db
          .prepare("SELECT COUNT(*) AS c FROM exam_results WHERE exam_id = ? AND student_id = ? AND status = 'submitted'")
          .get(r.id, user.id) as { c: number };
        const resume = db
          .prepare("SELECT id FROM exam_results WHERE exam_id = ? AND student_id = ? AND status IN ('in_progress','disconnected')")
          .get(r.id, user.id) as { id: string } | undefined;
        return { ...s, attemptsUsed: attemptsUsed.c, resumableAttemptId: resume?.id ?? null };
      }),
    });
  })
);

router.post(
  '/exams/:id/attempts',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const user = authed.user!;
    if (user.role !== 'student') throw new HttpError(403, 'FORBIDDEN', 'Chỉ học viên vào thi được');
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(String(req.params.id)) as ExamRow | undefined;
    if (!exam || exam.status !== 'published') throw new HttpError(404, 'NOT_FOUND', 'Đề thi không khả dụng');
    const cfg = getConfig(exam);
    const now = new Date();
    if (cfg.start_at && new Date(cfg.start_at) > now) throw new HttpError(400, 'NOT_OPEN', 'Bài thi chưa mở');
    if (cfg.end_at && new Date(cfg.end_at) < now) throw new HttpError(400, 'CLOSED', 'Bài thi đã đóng');

    if (cfg.class_id) {
      const enrolled = db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(cfg.class_id, user.id);
      if (!enrolled) throw new HttpError(403, 'FORBIDDEN', 'Bạn không thuộc lớp được giao bài thi này');
    }

    const existing = db
      .prepare("SELECT * FROM exam_results WHERE exam_id = ? AND student_id = ?")
      .get(exam.id, user.id) as AttemptRow | undefined;

    if (existing && (existing.status === 'in_progress' || existing.status === 'disconnected')) {
      return respondWithAttempt(res, exam, existing, false);
    }

    if (cfg.password && req.body?.password !== cfg.password) {
      throw new HttpError(403, 'WRONG_PASSWORD', cfg.password ? 'Mật khẩu bài thi không đúng' : '');
    }

    const purpose = cfg.purpose ?? 'online_test';
    const maxAttempts = cfg.max_attempts ?? 1;
    const submittedCount = db
      .prepare("SELECT COUNT(*) AS c FROM exam_results WHERE exam_id = ? AND student_id = ? AND status = 'submitted'")
      .get(exam.id, user.id) as { c: number };
    if (submittedCount.c >= maxAttempts) {
      throw new HttpError(400, 'MAX_ATTEMPTS', `Bạn đã dùng hết ${maxAttempts} lượt làm bài`);
    }

    const questionIds = JSON.parse(exam.question_ids_json) as string[];
    if (questionIds.length === 0) throw new HttpError(400, 'EMPTY_EXAM', 'Đề thi chưa có câu hỏi');
    const placeholders = questionIds.map(() => '?').join(',');
    const bank = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...questionIds) as unknown as BankQuestion[];
    const orderMap = new Map(questionIds.map((qid, i) => [qid, i]));
    const sortedBank = [...bank].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    const { questions, key } = generatePaper(sortedBank, {
      shuffleQuestions: cfg.shuffle_questions ?? true,
      shuffleOptions: cfg.shuffle_options ?? true,
    });

    const deadlineAt = new Date(now.getTime() + exam.duration_min * 60_000).toISOString();
    const detail: AttemptDetail = { questions, key, answers: {}, perQuestion: {}, deadlineAt };
    const id = randomUUID();
    db.prepare(
      `INSERT INTO exam_results (id, exam_id, student_id, status, remaining_sec, saved_answers_json, answers_detail_json)
       VALUES (?, ?, ?, 'in_progress', ?, '{}', ?)`
    ).run(id, exam.id, user.id, exam.duration_min * 60, JSON.stringify(detail));

    const row = getFreshAttempt(id);
    return respondWithAttempt(res, exam, row, true);
  })
);

function getFreshAttempt(id: string): AttemptRow {
  return queryOne<AttemptRow>('SELECT * FROM exam_results WHERE id = ?', id)!;
}

function respondWithAttempt(res: Response, exam: ExamRow, attempt: AttemptRow, isNew: boolean) {
  const detail = JSON.parse(attempt.answers_detail_json) as AttemptDetail;
  let remainingSec = exam.duration_min * 60;
  if (detail.deadlineAt) {
    remainingSec = Math.max(0, Math.floor((new Date(detail.deadlineAt).getTime() - Date.now()) / 1000));
  } else {
    remainingSec = Math.min(attempt.remaining_sec, remainingSec);
  }
  if (remainingSec <= 0 && attempt.status !== 'submitted') {
    db.prepare("UPDATE exam_results SET status = 'disconnected' WHERE id = ?").run(attempt.id);
  }
  res.json({
    attempt: {
      id: attempt.id,
      status: attempt.status,
      isNew,
      remainingSec,
      examTitle: exam.title,
      durationMin: exam.duration_min,
      answers: detail.answers,
    },
    questions: detail.questions,
  });
}

router.put(
  '/attempts/:id/answers',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const attempt = getAttemptOrThrow(String(req.params.id), authed.user!.id);
    if (attempt.status === 'submitted') throw new HttpError(400, 'ALREADY_SUBMITTED', 'Bài đã nộp');
    const answers = z.record(z.string(), z.string().max(2000)).safeParse(req.body?.answers);
    if (!answers.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu đáp án không hợp lệ');
    const detail = JSON.parse(attempt.answers_detail_json) as AttemptDetail;
    detail.answers = answers.data;
    db.prepare("UPDATE exam_results SET saved_answers_json = ?, answers_detail_json = ?, status = 'in_progress', updated_at = datetime('now') WHERE id = ?").run(
      JSON.stringify(answers.data),
      JSON.stringify(detail),
      attempt.id
    );
    res.json({ ok: true, savedAt: new Date().toISOString() });
  })
);

router.post(
  '/attempts/:id/redflag',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const attempt = getAttemptOrThrow(String(req.params.id), authed.user!.id);
    if (attempt.status === 'submitted') {
      res.json({ ok: true });
      return;
    }
    db.prepare('UPDATE exam_results SET red_flags = red_flags + 1, updated_at = datetime(\'now\') WHERE id = ?').run(attempt.id);
    res.json({ ok: true });
  })
);

function gradeAttempt(detail: AttemptDetail): { score: number | null; provisionalScore: number; fullyGraded: boolean } {
  const n = detail.questions.length;
  const share = n > 0 ? 10 / n : 0;
  const totalShares = n * share;
  let earned = 0;
  let gradedShares = 0;
  for (const qid of Object.keys(detail.key)) {
    const entry = detail.key[qid];
    if (!entry) continue;
    let state = detail.perQuestion[qid];
    if (!state) {
      state = { s: null, c: null, k: 'pending' };
      detail.perQuestion[qid] = state;
    }
    if (entry.type === 'mcq') {
      gradedShares += share;
      const chosen = (detail.answers[qid] ?? '').trim().toUpperCase();
      const correct = chosen === (entry.letter ?? '').toUpperCase();
      if (state) {
        state.s = chosen || null;
        state.c = entry.letter;
        state.k = correct;
      }
      if (correct) earned += share;
    } else {
      const manualScore = state?.essayScore;
      if (typeof manualScore === 'number') {
        earned += (manualScore / 10) * share;
        gradedShares += share;
        if (state) state.k = true;
    } else if (entry.type === 'fill') {
      gradedShares += share;
      const given = (detail.answers[qid] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const expected = (entry.correctText ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const correct = given.length > 0 && given === expected;
      if (state) {
        state.s = detail.answers[qid] ?? null;
        state.c = expected || null;
        state.k = correct;
      }
      if (correct) earned += share;
    } else {
        if (state) {
          state.k = 'pending';
          state.s = detail.answers[qid] ?? null;
        }
      }
    }
  }
  const fullyGraded = gradedShares >= totalShares - 1e-9;
  const provisionalScore = gradedShares > 0 ? Math.round((earned / gradedShares) * 10 * 100) / 100 : 0;
  return { score: fullyGraded ? Math.round(earned * 100) / 100 : null, provisionalScore, fullyGraded };
}

router.post(
  '/attempts/:id/submit',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const attempt = getAttemptOrThrow(String(req.params.id), authed.user!.id);
    if (attempt.status === 'submitted') throw new HttpError(400, 'ALREADY_SUBMITTED', 'Bài đã được nộp trước đó');
    const detail = JSON.parse(attempt.answers_detail_json) as AttemptDetail;
    if (req.body?.answers && typeof req.body.answers === 'object') {
      detail.answers = { ...detail.answers, ...(req.body.answers as Record<string, string>) };
    }
    const graded = gradeAttempt(detail);
    db.prepare(
      "UPDATE exam_results SET status = 'submitted', saved_answers_json = ?, answers_detail_json = ?, score = ?, submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(detail.answers), JSON.stringify(detail), graded.score, attempt.id);
    res.json({ score: graded.score, provisionalScore: graded.provisionalScore, fullyGraded: graded.fullyGraded });
  })
);

router.get(
  '/exams/:id/results',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(String(req.params.id)) as ExamRow | undefined;
    if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy đề');
    if (!canManageExam(exam, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem kết quả');

    const rows = db
      .prepare(
        `SELECT r.*, u.display_name, u.username FROM exam_results r JOIN users u ON u.id = r.student_id
         WHERE r.exam_id = ? ORDER BY u.display_name`
      )
      .all(exam.id) as unknown as (AttemptRow & { display_name: string; username: string })[];

    const results = rows.map((r) => {
      const detail = JSON.parse(r.answers_detail_json) as AttemptDetail;
      const pendingEssays = Object.values(detail.perQuestion).filter((p) => p.k === 'pending').length;
      return {
        resultId: r.id,
        studentId: r.student_id,
        studentName: r.display_name,
        username: r.username,
        status: r.status,
        score: r.score,
        provisionalScore: r.score,
        redFlags: r.red_flags,
        answeredCount: Object.keys(detail.answers).length,
        totalCount: detail.questions.length,
        pendingEssays,
        updatedAt: r.updated_at,
        perQuestion: detail.perQuestion,
        answers: detail.answers,
      };
    });

    const cfg0 = getConfig(exam);
    const classSize = cfg0.class_id
      ? (db.prepare('SELECT COUNT(*) AS c FROM enrollments WHERE class_id = ?').get(cfg0.class_id) as { c: number }).c
      : results.length;
    const stats = {
      submittedCount: results.filter((r) => r.status === 'submitted').length,
      notSubmittedCount: Math.max(0, classSize - results.length),
      classSize,
    };
    const firstDetail = rows[0] ? (JSON.parse(rows[0].answers_detail_json) as AttemptDetail) : null;
    const essayQuestions = (firstDetail?.questions ?? [])
      .filter((q) => q.type === 'essay')
      .map((q) => ({
        id: q.id,
        content: q.content,
        reference: firstDetail?.key[q.id]?.correctText ?? '',
      }));
    res.json({ results, stats, essayQuestions });
  })
)

router.get(
  '/exams/:id/stats',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(String(req.params.id)) as ExamRow | undefined;
    if (!exam) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy đề');
    if (!canManageExam(exam, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');

    const rows = db
      .prepare(
        `SELECT r.score, r.answers_detail_json FROM exam_results r WHERE r.exam_id = ? AND r.status = 'submitted'`
      )
      .all(exam.id) as { score: number | null; answers_detail_json: string }[];

    const scores = rows.map((r) => r.score).filter((s): s is number => typeof s === 'number');
    const buckets = Array.from({ length: 10 }, (_, i) => ({ range: `${i}-${i + 1}`, count: 0 }));    for (const s of scores) {
      const idx = Math.min(Math.floor(s), 9);
      const bucket = buckets[idx];
      if (bucket) bucket.count++;
    }
    const detailFirst = rows[0] ? (JSON.parse(rows[0].answers_detail_json) as AttemptDetail) : null;
    const wrongByQuestion: Record<string, { content: string; wrong: number; total: number }> = {};
    for (const row of rows) {
      const detail = JSON.parse(row.answers_detail_json) as AttemptDetail;
      for (const q of detail.questions) {
        const entry = wrongByQuestion[q.id] ??= { content: q.content.slice(0, 120), wrong: 0, total: 0 };
        if (entry.total === 0 && detailFirst) entry.content = detailFirst.questions.find((x) => x.id === q.id)?.content.slice(0, 120) ?? entry.content;
        const pq = detail.perQuestion[q.id];
        if (entry && pq && (pq.k === false || pq.k === 'pending')) entry.wrong++;
        entry.total++;
      }
    }
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    res.json({
      submittedCount: rows.length,
      avgScore: Math.round(avg * 100) / 100,
      buckets,
      wrongAnalysis: Object.entries(wrongByQuestion)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.wrong - a.wrong)
        .slice(0, 20),
    });
  })
);

const essayGradeSchema = z.object({
  scores: z.record(z.string(), z.number().min(0).max(10)),
});

router.put(
  '/results/:resultId/essay-scores',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const row = db.prepare('SELECT * FROM exam_results WHERE id = ?').get(String(req.params.resultId)) as AttemptRow | undefined;
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy bài làm');
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(row.exam_id) as ExamRow | undefined;
    if (!exam || !canManageExam(exam, authed.user!)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền chấm bài này');
    const parsed = essayGradeSchema.safeParse(req.body);
    if (!parsed.success)
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Điểm không hợp lệ (thang 0-10)');
    const detail = JSON.parse(row.answers_detail_json) as AttemptDetail;
    for (const [qid, score] of Object.entries(parsed.data.scores)) {
      const pq = detail.perQuestion[qid];
      if (pq) pq.essayScore = score;
    }
    const graded = gradeAttempt(detail);
    db.prepare('UPDATE exam_results SET answers_detail_json = ?, score = ? WHERE id = ?').run(JSON.stringify(detail), graded.score, row.id);
    res.json({ score: graded.score, provisionalScore: graded.provisionalScore, fullyGraded: graded.fullyGraded });
  })
);

export default router;
