import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { unlinkSync } from 'node:fs';
import multer from 'multer';
import { db, queryAll, run, tx } from '../db/connection.js';
import { MEDIA_DIR } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { deleteRagDocument, listRagChunkStats, processRagDocument, retrieveWithVectors } from '../services/rag.js';
import { generateText } from '../services/gemini.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('teacher', 'admin'));

const RAG_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `rag-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!RAG_EXT[ext]) {
      cb(new Error(`RAG hỗ trợ: PDF, DOCX, PPTX, TXT, MD — không hỗ trợ ${ext}`));
      return;
    }
    cb(null, true);
  },
});

router.get(
  '/rag/documents',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const docs = queryAll<{
      id: string;
      filename: string;
      status: string;
      error_msg: string | null;
      page_count: number;
      size_bytes: number;
      created_at: string;
    }>(
      'SELECT id, filename, status, error_msg, page_count, size_bytes, created_at FROM rag_documents WHERE owner_id = ? ORDER BY created_at DESC',
      authed.user!.id
    );
    res.json({ documents: docs, stats: listRagChunkStats(authed.user!.id) });
  })
);

router.post(
  '/rag/documents',
  upload.single('file'),
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const file = req.file;
    if (!file) throw new HttpError(400, 'NO_FILE', 'Không nhận được tệp');
    const id = randomUUID();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    run(
      `INSERT INTO rag_documents (id, owner_id, filename, file_path, mime_type, size_bytes, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      id,
      authed.user!.id,
      originalName,
      file.filename,
      RAG_EXT[path.extname(file.originalname).toLowerCase()] ?? file.mimetype,
      file.size
    );
    void processRagDocument(id);
    res.status(201).json({ id, status: 'pending' });
  })
);

router.delete(
  '/rag/documents/:id',
  h(async (req, res) => {
    const ok = deleteRagDocument(String(req.params.id), (req as AuthedRequest).user!.id);
    if (!ok) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy tài liệu');
    res.json({ ok: true });
  })
);

const chatSchema = z.object({
  question: z.string().min(3).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(8).default([]),
});

router.post(
  '/rag/chat',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success || !authed.user) throw new HttpError(400, 'BAD_INPUT', 'Câu hỏi không hợp lệ');
    const { question, history } = parsed.data;

    const chunks = await retrieveWithVectors(authed.user.id, question, 6);

    let answer: string;
    if (chunks.length === 0) {
      answer =
        'Chưa có tài liệu nào trong kho Trợ giảng AI (hoặc tài liệu chưa xử lý xong). Hãy upload giáo trình/bài giảng ở phần Tài liệu trước khi hỏi.';
    } else {
      const context = chunks
        .map((c, i) => `[Nguồn ${i + 1} — ${c.docName}, trang ${c.page}${c.heading_path ? `, mục "${c.heading_path}"` : ''}]\n${c.text}`)
        .join('\n\n---\n\n')
        .slice(0, 60_000);

      const historyText = history
        .map((h) => `${h.role === 'user' ? 'GIÁO VIÊN' : 'TRỢ GIẢNG'}: ${h.content}`)
        .join('\n');

      const prompt = [
        'Bạn là trợ giảng AI của giáo viên. CHỈ trả lời dựa trên các nguồn tài liệu được cung cấp dưới đây.',
        'QUY TẮC CỨNG:',
        '1. Không bịa đặt thông tin ngoài tài liệu.',
        '2. Khi dùng thông tin từ nguồn nào, ghi trích dẫn dạng [Nguồn X].',
        '3. Nếu tài liệu không đủ để trả lời, nói rõ điều đó và gợi ý giáo viên bổ sung tài liệu.',
        '4. Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt, có thể dùng Markdown và LaTeX $...$.',
        '',
        historyText ? `[HỘI THOẠI TRƯỚC ĐÓ]\n${historyText}\n` : '',
        `[TÀI LIỆU THAM KHẢO]\n${context}`,
        '',
        `[CÂU HỎI] ${question}`,
      ].join('\n');

      try {
        answer = await generateText({ prompt, temperature: 0.4, feature: 'rag-chat' });
      } catch (error) {
        if (error instanceof HttpError && (error.code === 'NO_API_KEY' || error.status === 502)) {
          answer = [
            '(Chế độ ngoại tuyến — chưa cấu hình Gemini API key nên hiển thị đoạn trích liên quan nhất.)',
            '',
            ...chunks.slice(0, 3).map((c, i) => `📌 Theo [Nguồn ${i + 1} — ${c.docName}, trang ${c.page}]:\n"${c.text.slice(0, 300)}..."`),
          ].join('\n\n');
        } else {
          throw error;
        }
      }
    }

    res.json({
      answer,
      sources: chunks.map((c) => ({
        docName: c.docName,
        page: c.page,
        heading: c.heading_path,
        snippet: c.text.slice(0, 180),
        score: Math.round(c.score * 1000) / 1000,
      })),
    });
  })
);

export default router;
