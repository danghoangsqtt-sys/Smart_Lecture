import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, tx, queryOne } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { parseExamText } from '../services/textExamParser.js';

const router = Router();
router.use(requireAuth);
router.use('/questions', requireRole('teacher', 'admin'));

interface QuestionRow {
  id: string;
  owner_id: string;
  type: string;
  content: string;
  options_json: string;
  correct_answer: string;
  explanation: string;
  bloom_level: string;
  category: string;
  folder_id: string | null;
  image_path: string | null;
  is_public_bank: number;
}

function canModifyQuestion(q: QuestionRow, userId: string, role: string): boolean {
  return role === 'admin' || q.owner_id === userId || q.is_public_bank === 1 && role === 'admin';
}

function serializeQuestion(q: QuestionRow) {
  return {
    id: q.id,
    ownerId: q.owner_id,
    type: q.type as 'mcq' | 'essay',
    content: q.content,
    options: JSON.parse(q.options_json) as string[],
    correctAnswer: q.correct_answer,
    explanation: q.explanation,
    bloomLevel: q.bloom_level,
    category: q.category,
    folderId: q.folder_id,
    imagePath: q.image_path,
    isPublicBank: q.is_public_bank === 1,
  };
}

router.get(
  '/questions',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const user = authed.user!;
    const type = req.query.type as string | undefined;
    const bloom = req.query.bloom as string | undefined;
    const folderId = req.query.folderId as string | undefined;
    const q = ((req.query.q as string) ?? '').trim();
    let sql = `SELECT * FROM questions WHERE (owner_id = ? OR is_public_bank = 1)`;
    const params: (string | number | null)[] = [user.id];
    if (type === 'mcq' || type === 'essay') {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (bloom) {
      sql += ' AND bloom_level = ?';
      params.push(bloom);
    }
    if (folderId === 'none') {
      sql += ' AND folder_id IS NULL';
    } else if (folderId) {
      sql += ' AND folder_id = ?';
      params.push(folderId);
    }
    if (q) {
      sql += ' AND content LIKE ?';
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY created_at DESC LIMIT ${Number(req.query.limit ?? 200)}`;
    const rows = db.prepare(sql).all(...params) as unknown as QuestionRow[];
    res.json({ questions: rows.map(serializeQuestion), total: rows.length });
  })
);

const upsertSchema = z.object({
  type: z.enum(['mcq', 'essay', 'fill']),
  content: z.string().min(3).max(5000),
  options: z.array(z.string().max(1000)).max(4).optional(),
  correctAnswer: z.string().max(3000).default(''),
  explanation: z.string().max(5000).default(''),
  bloomLevel: z.string().max(50).default(''),
  category: z.string().max(120).default(''),
  folderId: z.string().nullable().optional(),
});

router.post(
  '/questions',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', parsed.success ? '?' : (parsed.error.issues[0]?.message ?? 'Dá»¯ liá»‡u khÃ´ng há»£p lá»‡'));
    const data = parsed.data;
    if (data.type === 'mcq') {
      if (!data.options || data.options.length !== 4) throw new HttpError(400, 'BAD_INPUT', 'Câu trắc nghiệm cần đúng 4 phương án');
      if (!/^[A-D]$/.test(data.correctAnswer)) throw new HttpError(400, 'BAD_INPUT', 'Đáp án đúng phải là A/B/C/D');
    }
    if (data.type === 'fill' && !data.correctAnswer.trim()) {
      throw new HttpError(400, 'BAD_INPUT', 'Câu điền chỗ trống cần có đáp án');
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer, explanation, bloom_level, category, folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      authed.user.id,
      data.type,
      data.content,
      JSON.stringify(data.type === 'mcq' ? data.options : []),
      data.correctAnswer,
      data.explanation,
      data.bloomLevel,
      data.category,
      data.folderId ?? null
    );
    const row = queryOne<QuestionRow>('SELECT * FROM questions WHERE id = ?', id)!
    res.status(201).json({ question: serializeQuestion(row) });
  })
);

router.put(
  '/questions/:id',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(String(req.params.id)) as QuestionRow | undefined;
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y cÃ¢u há»i');
    if (!canModifyQuestion(existing, authed.user!.id, authed.user!.role)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n sá»­a cÃ¢u há»i nÃ y');
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dá»¯ liá»‡u khÃ´ng há»£p lá»‡');
    const d = parsed.data;
    const options = d.options !== undefined ? JSON.stringify(d.options) : existing.options_json;
    db.prepare(
      `UPDATE questions SET type=?, content=?, options_json=?, correct_answer=?, explanation=?, bloom_level=?, category=?, folder_id=? WHERE id=?`
    ).run(
      d.type ?? existing.type,
      d.content ?? existing.content,
      options,
      d.correctAnswer ?? existing.correct_answer,
      d.explanation ?? existing.explanation,
      d.bloomLevel ?? existing.bloom_level,
      d.category ?? existing.category,
      d.folderId !== undefined ? d.folderId : existing.folder_id,
      existing.id
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/questions/:id',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(String(req.params.id)) as QuestionRow | undefined;
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y cÃ¢u há»i');
    if (!canModifyQuestion(existing, authed.user!.id, authed.user!.role)) throw new HttpError(403, 'FORBIDDEN', 'KhÃ´ng cÃ³ quyá»n xÃ³a cÃ¢u há»i nÃ y');
    db.prepare('DELETE FROM questions WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  })
);

router.post(
  '/questions/bulk-delete',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const ids = z.array(z.string()).min(1).max(500).safeParse(req.body?.ids);
    if (!ids.success) throw new HttpError(400, 'BAD_INPUT', 'Danh sÃ¡ch khÃ´ng há»£p lá»‡');
    let deleted = 0;
    tx(() => {
      for (const id of ids.data) {
        const q = db.prepare('SELECT owner_id FROM questions WHERE id = ?').get(id) as { owner_id: string } | undefined;
        if (!q) continue;
        if (authed.user!.role === 'admin' || q.owner_id === authed.user!.id) {
          db.prepare('DELETE FROM questions WHERE id = ?').run(id);
          deleted++;
        }
      }
    });
    res.json({ deleted });
  })
);

router.post(
  '/questions/folders',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = z.object({ name: z.string().min(1).max(120), module: z.enum(['question', 'exam']).default('question') }).safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'TÃªn thÆ° má»¥c khÃ´ng há»£p lá»‡');
    const id = randomUUID();
    db.prepare('INSERT INTO folders (id, owner_id, name, module) VALUES (?, ?, ?, ?)').run(
      id,
      authed.user.id,
      parsed.data.name,
      parsed.data.module
    );
    res.status(201).json({ id, name: parsed.data.name });
  })
);

router.get(
  '/questions/folders',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const rows = db
      .prepare('SELECT id, name FROM folders WHERE owner_id = ? AND module = ? ORDER BY name')
      .all(authed.user!.id, 'question') as { id: string; name: string }[];
    res.json({ folders: rows });
  })
);

router.delete(
  '/questions/folders/:id',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const result = db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').run(String(req.params.id), authed.user!.id);
    if (result.changes === 0) throw new HttpError(404, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y thÆ° má»¥c');
    res.json({ ok: true });
  })
);

router.post(
  '/questions/import-text',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (text.length < 10) throw new HttpError(400, 'BAD_INPUT', 'Ná»™i dung vÄƒn báº£n trá»‘ng hoáº·c quÃ¡ ngáº¯n');
    const folderId = typeof req.body?.folderId === 'string' && req.body.folderId ? (req.body.folderId as string) : null;
    const { questions, warnings } = parseExamText(text.slice(0, 2_000_000));
    const valid = questions.filter((q) => q.content.trim() && (q.type === 'essay' || (/^[A-D]$/.test(q.correctAnswer) && q.options.length >= 2)));
    const ids: string[] = [];
    tx(() => {
      for (const q of valid) {
        const id = randomUUID();
        ids.push(id);
        db.prepare(
          `INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer, explanation, bloom_level, category, folder_id)
           VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?)`
        ).run(id, authed.user!.id, q.type, q.content, JSON.stringify(q.options), q.correctAnswer, '', folderId);
      }
    });
    res.json({ imported: ids.length, warnings });
  })
);

export default router;
