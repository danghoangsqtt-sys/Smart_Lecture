import { Router } from 'express';
import { z } from 'zod';
import { Type, type Schema } from '@google/genai';
import { db } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { generateJSON } from '../services/gemini.js';
import { generateQuestionsByMatrix, type BloomLevel } from '../services/aiQuestions.js';
import { quotaStatus } from '../services/quota.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('teacher', 'admin'));

const generateSchema = z.object({
  sourceText: z.string().min(200).max(2_000_000),
  counts: z.record(z.string(), z.number().int().min(0).max(20)),
});

const essaySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER },
    feedback: { type: Type.STRING },
  },
  required: ['score', 'feedback'],
};

const commentSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    comment: { type: Type.STRING },
  },
  required: ['comment'],
};

router.post(
  '/ai/generate-questions',
  h(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Cần cung cấp văn bản tài liệu (tối thiểu 200 ký tự) và ma trận số câu');
    const totalCount = Object.values(parsed.data.counts).reduce((a, b) => a + b, 0);
    if (totalCount === 0) throw new HttpError(400, 'BAD_INPUT', 'Ma trận số câu đang bằng 0');
    if (totalCount > 50) throw new HttpError(400, 'BAD_INPUT', 'Tối đa 50 câu mỗi lần sinh');
    const questions = await generateQuestionsByMatrix({ sourceText: parsed.data.sourceText, counts: parsed.data.counts as Partial<Record<BloomLevel, number>> });
    res.json({ questions, requestedCount: totalCount });
  })
);

const essayGradeBody = z.object({
  questionContent: z.string().min(3).max(5000),
  referenceAnswer: z.string().max(8000).default(''),
  studentAnswer: z.string().min(1).max(10000),
});

router.post(
  '/ai/grade-essay',
  h(async (req, res) => {
    const parsed = essayGradeBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Thiếu nội dung câu hỏi hoặc bài làm');
    const result = await generateJSON<{ score: number; feedback: string }>({
      prompt: [
        'Bạn là giáo viên chấm bài tự luận. Hãy chấm điểm bài làm của học viên trên thang 0-10.',
        parsed.data.referenceAnswer ? `Đáp án tham khảo: ${parsed.data.referenceAnswer}` : 'Không có đáp án tham khảo, hãy dựa vào kiến thức đúng đắn về nội dung câu hỏi.',
        'feedback là nhận xét ngắn gọn bằng tiếng Việt (1-3 câu), chỉ ra điểm được và thiếu sót.',
        '',
        `[CÂU HỎI] ${parsed.data.questionContent}`,
        `[BÀI LÀM CỦA HỌC VIÊN] ${parsed.data.studentAnswer}`,
      ].join('\n'),
      schema: essaySchema,
      temperature: 0.3,
      feature: 'ai-grade-essay',
    });
    const score = Math.max(0, Math.min(10, Math.round(result.score * 10) / 10));
    res.json({ score, feedback: result.feedback });
  })
);

const commentBody = z.object({
  studentName: z.string().max(100),
  score: z.number().min(0).max(10).nullable(),
  timeSpentSec: z.number().int().min(0).default(0),
  redFlags: z.number().int().min(0).default(0),
  wrongQuestions: z.array(z.string().max(300)).max(10).default([]),
});

router.post(
  '/ai/comment-student',
  h(async (req, res) => {
    const parsed = commentBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu nhận xét không hợp lệ');
    const d = parsed.data;
    const result = await generateJSON<{ comment: string }>({
      prompt: [
        `Viết nhận xét ngắn gọn (30-60 chữ, tiếng Việt, mang tính động viên xây dựng) cho học viên ${d.studentName} sau bài kiểm tra.`,
        `- Điểm: ${d.score ?? 'chưa có'}`,
        `- Thời gian làm bài: ${Math.round(d.timeSpentSec / 60)} phút`,
        `- Số lần rời màn hình khi thi: ${d.redFlags}`,
        d.wrongQuestions.length ? `- Các câu làm sai: ${d.wrongQuestions.slice(0, 5).join('; ')}` : '- Không có thông tin câu sai',
      ].join('\n'),
      schema: commentSchema,
      temperature: 0.6,
      feature: 'ai-comment-student',
    });
    res.json({ comment: result.comment });
  })
);

router.get(
  '/ai/quota',
  h(async (_req, res) => {
    res.json({ quota: quotaStatus() });
  })
);

export default router;
