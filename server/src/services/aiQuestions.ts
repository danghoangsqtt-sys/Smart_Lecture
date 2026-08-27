import { Type, type Schema } from '@google/genai';
import { generateJSON } from './ai.js';

export const BLOOM_LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

export interface GeneratedQuestion {
  content: string;
  type: 'mcq' | 'essay';
  options: string[];
  correctAnswer: string;
  explanation: string;
  bloomLevel: string;
}

const questionArraySchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      content: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctAnswer: { type: Type.STRING },
      explanation: { type: Type.STRING },
      bloomLevel: { type: Type.STRING },
    },
    required: ['content', 'correctAnswer', 'explanation', 'bloomLevel'],
  },
};

const MAX_SOURCE_CHARS = 240_000;

function buildPrompt(level: string, count: number, isEssay: boolean, sourceText: string): string {
  return [
    'Bạn là chuyên gia sư phạm giàu kinh nghiệm soạn câu hỏi kiểm tra.',
    '',
    '[QUY TẮC CỨNG]',
    '1. CHỈ được sử dụng thông tin từ tài liệu dưới đây. Tuyệt đối không bịa đặt kiến thức ngoài tài liệu.',
    '2. Nếu tài liệu không đủ thông tin để sinh đủ số câu, hãy trả về số câu có thể và để trống phần còn lại (trả mảng rỗng [] nếu không sinh được câu nào).',
    '3. Mỗi câu trắc nghiệm có đúng 4 phương án và chỉ một đáp án đúng; "correctAnswer" là chữ cái A/B/C/D ứng với đáp án đúng.',
    '4. Phương án sai phải hợp lý (bẫy nhận thức), không quá hiển nhiên vô lý.',
    '5. "explanation" là giải thích ngắn gọn vì sao đáp án đúng (2-3 câu).',
    '6. Nếu nội dung chứa công thức/toán học, dùng LaTeX trong $...$ hoặc $$...$$.',
    '7. Không lặp lại nội dung câu hỏi đã có.',
    '',
    `[TÀI LIỆU]`,
    sourceText.slice(0, MAX_SOURCE_CHARS),
    '',
    `[YÊU CẦU]`,
    `Sinh ${count} câu ở mức nhận thức "${level}" dạng ${isEssay ? 'TỰ LUẬN (không có options, correctAnswer là dàn ý đáp án)' : 'TRẮC NGHIỆM 4 phương án'}.`,
    'Trả về JSON array đúng schema.',
  ].join('\n');
}

function normalize(
  raw: Partial<Record<string, unknown>>,
  level: string,
  isEssay: boolean
): GeneratedQuestion | null {
  const content = typeof raw['content'] === 'string' ? raw['content'].trim() : '';
  if (!content) return null;
  let options: string[] = Array.isArray(raw['options'])
    ? raw['options'].filter((o): o is string => typeof o === 'string' && o.trim() !== '').map((o) => o.trim())
    : [];
  let correctAnswer = typeof raw['correctAnswer'] === 'string' ? raw['correctAnswer'].trim() : '';
  if (!isEssay) {
    options = options.slice(0, 4);
    while (options.length < 4) options.push(`Phương án ${String.fromCharCode(65 + options.length)}`);
    const letterMatch = correctAnswer.match(/^([A-Da-d])\b/);
    if (!letterMatch?.[1]) {
      const idx = options.findIndex((o) => o.replace(/\s+/g, '').toLowerCase() === correctAnswer.replace(/\s+/g, '').toLowerCase());
      correctAnswer = idx >= 0 ? String.fromCharCode(65 + idx) : 'A';
    } else {
      correctAnswer = letterMatch[1].toUpperCase();
    }
  }
  return {
    content,
    type: isEssay ? 'essay' : 'mcq',
    options: isEssay ? [] : options,
    correctAnswer,
    explanation: typeof raw['explanation'] === 'string' ? raw['explanation'].trim() : '',
    bloomLevel: level,
  };
}

export async function generateQuestionsByMatrix(input: {
  sourceText: string;
  counts: Partial<Record<BloomLevel, number>>;
}): Promise<GeneratedQuestion[]> {
  const results: GeneratedQuestion[] = [];
  for (const level of BLOOM_LEVELS) {
    const count = input.counts[level] ?? 0;
    if (count <= 0) continue;
    const isEssay = false;
    const rawList = await generateJSON<Record<string, unknown>[]>({
      prompt: buildPrompt(level, Math.min(count, 20), isEssay, input.sourceText),
      schema: questionArraySchema,
      temperature: 0.45,
      feature: 'ai-generate-questions',
    });
    if (!Array.isArray(rawList)) continue;
    for (const raw of rawList.slice(0, count)) {
      const normalized = normalize(raw, level, isEssay);
      if (normalized && !results.some((r) => r.content === normalized.content)) {
        results.push(normalized);
      }
    }
  }
  return results;
}
