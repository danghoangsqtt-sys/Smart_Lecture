import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db, tx, queryOne } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { parseExamText } from '../services/textExamParser.js';
import { parseDocument } from '../services/docparse.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.txt', '.md', '.docx', '.pdf'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    cb(null, allowed.includes(ext));
  },
});

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
  subject_id: string | null;
  chapter: string;
  lesson: string;
  difficulty: string;
  image_path: string | null;
  is_public_bank: number;
  content_hash?: string;
}

function assertCanUseSubject(subjectId: string | null | undefined, user: NonNullable<AuthedRequest['user']>): void {
  if (!subjectId) return;
  const subject = db.prepare('SELECT class_id FROM subjects WHERE id = ?').get(subjectId) as { class_id: string } | undefined;
  if (!subject) throw new HttpError(404, 'SUBJECT_NOT_FOUND', 'Không tìm thấy môn học');
  if (!canManageClass(getClassOrThrow(subject.class_id), user)) {
    throw new HttpError(403, 'FORBIDDEN', 'Không có quyền dùng môn học này');
  }
}

const questionContextSchema = z.object({
  subjectId: z.preprocess((value) => value === '' || value === undefined ? null : value, z.string().min(1).nullable()).default(null),
  chapter: z.string().max(120).default(''),
  lesson: z.string().max(200).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

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
    subjectId: q.subject_id,
    chapter: q.chapter,
    lesson: q.lesson,
    difficulty: q.difficulty,
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
    const subjectId = req.query.subjectId as string | undefined;
    const chapter = req.query.chapter as string | undefined;
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
    if (subjectId) {
      sql += ' AND subject_id = ?';
      params.push(subjectId);
    }
    if (chapter) {
      sql += ' AND chapter = ?';
      params.push(chapter);
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

router.get(
  '/questions/stats',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    let sql = `SELECT q.id, q.chapter, q.difficulty, q.bloom_level,
      COALESCE(s.times_used, 0) AS times_used, COALESCE(s.times_correct, 0) AS times_correct,
      COALESCE(s.times_in_exam, 0) AS times_in_exam, COALESCE(s.times_in_game, 0) AS times_in_game,
      s.difficulty_estimate
      FROM questions q LEFT JOIN question_usage_stats s ON s.question_id = q.id
      WHERE (q.owner_id = ? OR q.is_public_bank = 1)`;
    const params: string[] = [user.id];
    if (subjectId) { sql += ' AND q.subject_id = ?'; params.push(subjectId); }
    const rows = db.prepare(sql).all(...params) as unknown as Array<{
      id: string; chapter: string; difficulty: string; bloom_level: string;
      times_used: number; times_correct: number; times_in_exam: number; times_in_game: number;
      difficulty_estimate: number | null;
    }>;
    const byChapter: Record<string, number> = {};
    const byDifficulty: Record<string, number> = {};
    const byBloom: Record<string, number> = {};
    let totalUsed = 0;
    let totalCorrect = 0;
    for (const row of rows) {
      const chapter = row.chapter || 'Khác';
      const bloom = row.bloom_level || 'Khác';
      byChapter[chapter] = (byChapter[chapter] ?? 0) + 1;
      byDifficulty[row.difficulty] = (byDifficulty[row.difficulty] ?? 0) + 1;
      byBloom[bloom] = (byBloom[bloom] ?? 0) + 1;
      totalUsed += row.times_used;
      totalCorrect += row.times_correct;
    }
    res.json({
      summary: { total: rows.length, totalUsed, correctRate: totalUsed ? Math.round(totalCorrect / totalUsed * 100) / 100 : 0, byChapter, byDifficulty, byBloom },
      difficultQuestions: rows.filter((row) => row.times_used >= 5 && row.times_correct / row.times_used < 0.4).slice(0, 20).map((row) => ({
        id: row.id,
        chapter: row.chapter,
        difficulty: row.difficulty,
        timesUsed: row.times_used,
        correctRate: Math.round(row.times_correct / row.times_used * 100) / 100,
        difficultyEstimate: row.difficulty_estimate,
      })),
    });
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
  subjectId: z.string().nullable().optional(),
  chapter: z.string().max(120).default(''),
  lesson: z.string().max(200).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

router.post(
  '/questions',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', parsed.success ? '?' : (parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ'));
    const data = parsed.data;
    assertCanUseSubject(data.subjectId, authed.user!);
    if (data.type === 'mcq') {
      if (!data.options || data.options.length !== 4) throw new HttpError(400, 'BAD_INPUT', 'Câu trắc nghiệm cần đúng 4 phương án');
      if (!/^[A-D]$/.test(data.correctAnswer)) throw new HttpError(400, 'BAD_INPUT', 'Đáp án đúng phải là A/B/C/D');
    }
    if (data.type === 'fill' && !data.correctAnswer.trim()) {
      throw new HttpError(400, 'BAD_INPUT', 'Câu điền chỗ trống cần có đáp án');
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer, explanation, bloom_level, category, folder_id, subject_id, chapter, lesson, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      data.folderId ?? null,
      data.subjectId ?? null,
      data.chapter,
      data.lesson,
      data.difficulty
    );
    const row = queryOne<QuestionRow>('SELECT * FROM questions WHERE id = ?', id)!
    res.status(201).json({ question: serializeQuestion(row) });
  })
);

const updateQuestion = h(async (req, res) => {
    const authed = req as AuthedRequest;
    const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(String(req.params.id)) as QuestionRow | undefined;
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy câu hỏi');
    if (!canModifyQuestion(existing, authed.user!.id, authed.user!.role)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa câu hỏi này');
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const d = parsed.data;
    if (d.subjectId !== undefined) assertCanUseSubject(d.subjectId, authed.user!);
    const options = d.options !== undefined ? JSON.stringify(d.options) : existing.options_json;
    db.prepare(
      `UPDATE questions SET type=?, content=?, options_json=?, correct_answer=?, explanation=?, bloom_level=?, category=?, folder_id=?, subject_id=?, chapter=?, lesson=?, difficulty=? WHERE id=?`
    ).run(
      d.type ?? existing.type,
      d.content ?? existing.content,
      options,
      d.correctAnswer ?? existing.correct_answer,
      d.explanation ?? existing.explanation,
      d.bloomLevel ?? existing.bloom_level,
      d.category ?? existing.category,
      d.folderId !== undefined ? d.folderId : existing.folder_id,
      d.subjectId !== undefined ? d.subjectId : existing.subject_id,
      d.chapter ?? existing.chapter,
      d.lesson ?? existing.lesson,
      d.difficulty ?? existing.difficulty,
      existing.id
    );
    res.json({ ok: true });
  });

router.put('/questions/:id', updateQuestion);
router.patch('/questions/:id', updateQuestion);

router.delete(
  '/questions/:id',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(String(req.params.id)) as QuestionRow | undefined;
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy câu hỏi');
    if (!canModifyQuestion(existing, authed.user!.id, authed.user!.role)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa câu hỏi này');
    db.prepare('DELETE FROM questions WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  })
);

router.post(
  '/questions/bulk-delete',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const ids = z.array(z.string()).min(1).max(500).safeParse(req.body?.ids);
    if (!ids.success) throw new HttpError(400, 'BAD_INPUT', 'Danh sách không hợp lệ');
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

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  folderId: z.string().nullable().optional(),
});

router.post(
  '/questions/bulk-move',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = bulkActionSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const { ids, folderId } = parsed.data;
    let moved = 0;
    tx(() => {
      for (const id of ids) {
        const q = db.prepare('SELECT owner_id FROM questions WHERE id = ?').get(id) as { owner_id: string } | undefined;
        if (!q) continue;
        if (authed.user!.role === 'admin' || q.owner_id === authed.user!.id) {
          db.prepare('UPDATE questions SET folder_id = ? WHERE id = ?').run(folderId ?? null, id);
          moved++;
        }
      }
    });
    res.json({ moved });
  })
);

router.post(
  '/questions/bulk-copy',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = bulkActionSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const { ids, folderId } = parsed.data;
    const newIds: string[] = [];
    tx(() => {
      for (const id of ids) {
        const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as QuestionRow | undefined;
        if (!q) continue;
        if (authed.user!.role === 'admin' || q.owner_id === authed.user!.id) {
          const newId = randomUUID();
          newIds.push(newId);
          db.prepare(
            `INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer, explanation, bloom_level, category, folder_id, subject_id, chapter, lesson, difficulty, content_hash, is_public_bank)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
          ).run(newId, authed.user!.id, q.type, q.content, q.options_json, q.correct_answer, q.explanation, q.bloom_level, q.category, folderId ?? null, q.subject_id, q.chapter, q.lesson, q.difficulty, q.content_hash ?? '');
        }
      }
    });
    res.json({ copied: newIds.length, ids: newIds });
  })
);

const bulkEditSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  bloomLevel: z.string().max(50).optional(),
  category: z.string().max(120).optional(),
});

router.post(
  '/questions/bulk-edit',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = bulkEditSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    const { ids, bloomLevel, category } = parsed.data;
    if (!bloomLevel && !category) throw new HttpError(400, 'BAD_INPUT', 'Không có trường nào để cập nhật');
    let updated = 0;
    tx(() => {
      for (const id of ids) {
        const q = db.prepare('SELECT owner_id FROM questions WHERE id = ?').get(id) as { owner_id: string } | undefined;
        if (!q) continue;
        if (authed.user!.role === 'admin' || q.owner_id === authed.user!.id) {
          const sets: string[] = [];
          const params: (string | null)[] = [];
          if (bloomLevel !== undefined) { sets.push('bloom_level = ?'); params.push(bloomLevel); }
          if (category !== undefined) { sets.push('category = ?'); params.push(category); }
          params.push(id);
          db.prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
          updated++;
        }
      }
    });
    res.json({ updated });
  })
);

router.post(
  '/questions/folders',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = z.object({ name: z.string().min(1).max(120), module: z.enum(['question', 'exam']).default('question') }).safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Tên thư mục không hợp lệ');
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
    if (result.changes === 0) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy thư mục');
    res.json({ ok: true });
  })
);

router.post(
  '/questions/import-text',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (text.length < 10) throw new HttpError(400, 'BAD_INPUT', 'Nội dung văn bản trống hoặc quá ngắn');
    const folderId = typeof req.body?.folderId === 'string' && req.body.folderId ? (req.body.folderId as string) : null;
    const context = questionContextSchema.parse(req.body ?? {});
    assertCanUseSubject(context.subjectId, authed.user!);
    const { questions, warnings } = parseExamText(text.slice(0, 2_000_000));
    const valid = questions.filter((q) => q.content.trim() && (q.type === 'essay' || (/^[A-D]$/.test(q.correctAnswer) && q.options.length >= 2)));
    const ids: string[] = [];
    tx(() => {
      for (const q of valid) {
        const id = randomUUID();
        ids.push(id);
        db.prepare(
          `INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer, explanation, bloom_level, category, folder_id, subject_id, chapter, lesson, difficulty)
           VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?)`
        ).run(id, authed.user!.id, q.type, q.content, JSON.stringify(q.options), q.correctAnswer, '', folderId, context.subjectId, context.chapter, context.lesson, context.difficulty);
      }
    });
    res.json({ imported: ids.length, ids, questions: ids.map((id) => ({ id })), warnings });
  })
);

router.post(
  '/questions/import-file',
  upload.single('file'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!req.file) throw new HttpError(400, 'BAD_INPUT', 'Không có file được tải lên');
    const folderId = typeof req.body?.folderId === 'string' && req.body.folderId ? (req.body.folderId as string) : null;
    const context = questionContextSchema.parse(req.body ?? {});
    assertCanUseSubject(context.subjectId, authed.user!);
    const extension = path.extname(req.file.originalname).toLowerCase();
    const temporaryPath = path.join(tmpdir(), `smart-lecture-question-${randomUUID()}${extension}`);
    writeFileSync(temporaryPath, req.file.buffer);
    let parsed;
    try {
      parsed = await parseDocument(temporaryPath, req.file.mimetype);
    } finally {
      try { unlinkSync(temporaryPath); } catch { /* already removed */ }
    }
    let text = parsed.pages.map((p) => p.text).join('\n\n');
    if (!text.trim()) throw new HttpError(400, 'BAD_INPUT', 'File không có nội dung text có thể đọc được');

    const { questions, warnings } = parseExamText(text.slice(0, 2_000_000));
    const valid = questions.filter((q) => q.content.trim() && (q.type === 'essay' || (/^[A-D]$/.test(q.correctAnswer) && q.options.length >= 2)));
    const ids: string[] = [];
    tx(() => {
      for (const q of valid) {
        const id = randomUUID();
        ids.push(id);
        db.prepare(
          `INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer, explanation, bloom_level, category, folder_id, subject_id, chapter, lesson, difficulty)
           VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?)`
        ).run(id, authed.user!.id, q.type, q.content, JSON.stringify(q.options), q.correctAnswer, '', folderId, context.subjectId, context.chapter, context.lesson, context.difficulty);
      }
    });
    res.json({ imported: ids.length, ids, questions: ids.map((id) => ({ id })), warnings });
  })
);

function formatQuestionTxt(q: QuestionRow, index: number): string {
  const opts = JSON.parse(q.options_json) as string[];
  let out = `Câu ${index}: ${q.content}\n`;
  if (q.type === 'mcq' || q.type === 'fill') {
    for (const opt of opts) out += `${opt}\n`;
    out += `Đáp án: ${q.correct_answer}\n`;
  } else {
    out += `Đáp án / Dàn ý: ${q.correct_answer}\n`;
  }
  if (q.explanation) out += `Giải thích: ${q.explanation}\n`;
  if (q.bloom_level) out += `Mức Bloom: ${q.bloom_level}\n`;
  if (q.category) out += `Chủ đề: ${q.category}\n`;
  return out + '\n';
}

router.get(
  '/questions/export/txt',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const user = authed.user!;
    const idsParam = req.query.ids as string | undefined;
    let where = '(owner_id = ? OR is_public_bank = 1)';
    const params: (string | number)[] = [user.id];
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        where += ` AND id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
    }
    const rows = db.prepare(`SELECT * FROM questions WHERE ${where} ORDER BY created_at DESC`).all(...params) as unknown as QuestionRow[];
    let content = `NGÂN HÀNG CÂU HỎI - EXPORT\nXuất lúc: ${new Date().toLocaleString('vi-VN')}\nTổng: ${rows.length} câu\n${'='.repeat(50)}\n\n`;
    rows.forEach((q, i) => { content += formatQuestionTxt(q, i + 1); });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="questions-export-${Date.now()}.txt"`);
    res.send(content);
  })
);

router.get(
  '/questions/export/docx',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const user = authed.user!;
    const idsParam = req.query.ids as string | undefined;
    let where = '(owner_id = ? OR is_public_bank = 1)';
    const params: (string | number)[] = [user.id];
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        where += ` AND id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
    }
    const rows = db.prepare(`SELECT * FROM questions WHERE ${where} ORDER BY created_at DESC`).all(...params) as unknown as QuestionRow[];
    const mammoth = await import('mammoth');
    // We'll generate a simple DOCX using a basic approach - create XML content
    // For simplicity, we'll use a template approach
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: 'NGÂN HÀNG CÂU HỎI', heading: HeadingLevel.TITLE }),
          new Paragraph({ text: `Xuất lúc: ${new Date().toLocaleString('vi-VN')}` }),
          new Paragraph({ text: `Tổng: ${rows.length} câu` }),
          new Paragraph({ text: '' }),
          ...rows.flatMap((q, i) => {
            const opts = JSON.parse(q.options_json) as string[];
            const children = [
              new Paragraph({ children: [new TextRun({ text: `Câu ${i + 1}: ${q.content}`, bold: true })] }),
            ];
            if (q.type === 'mcq' || q.type === 'fill') {
              for (const opt of opts) {
                const isCorrect = opt.startsWith(`${q.correct_answer}.`) || opt.startsWith(`${q.correct_answer})`) || opt.startsWith(`${q.correct_answer}:`);
                children.push(new Paragraph({ children: [new TextRun({ text: opt, bold: isCorrect, color: isCorrect ? '008000' : '000000' })] }));
              }
            }
            if (q.correct_answer) children.push(new Paragraph({ children: [new TextRun({ text: `Đáp án: ${q.correct_answer}`, bold: true, color: '008000' })] }));
            if (q.explanation) children.push(new Paragraph({ children: [new TextRun({ text: `Giải thích: ${q.explanation}`, italics: true })] }));
            if (q.bloom_level) children.push(new Paragraph({ children: [new TextRun({ text: `Mức Bloom: ${q.bloom_level}` })] }));
            if (q.category) children.push(new Paragraph({ children: [new TextRun({ text: `Chủ đề: ${q.category}` })] }));
            children.push(new Paragraph({ text: '' }));
            return children;
          }),
        ],
      }],
    });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="questions-export-${Date.now()}.docx"`);
    res.send(buffer);
  })
);

router.get(
  '/questions/:id',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(String(req.params.id)) as QuestionRow | undefined;
    if (!question) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy câu hỏi');
    if (question.owner_id !== authed.user!.id && question.is_public_bank !== 1 && authed.user!.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xem câu hỏi này');
    }
    res.json({ question: serializeQuestion(question) });
  })
);

export default router;
