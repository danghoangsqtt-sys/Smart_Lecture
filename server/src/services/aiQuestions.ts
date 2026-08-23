import { Type, type Schema } from '@google/genai';
import { generateJSON } from './gemini.js';

export const BLOOM_LEVELS = ['Nháº­n biáº¿t', 'ThÃ´ng hiá»ƒu', 'Váº­n dá»¥ng', 'Váº­n dá»¥ng cao'] as const;
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
    'Báº¡n lÃ  chuyÃªn gia sÆ° pháº¡m giÃ u kinh nghiá»‡m soáº¡n cÃ¢u há»i kiá»ƒm tra.',
    '',
    '[QUY Táº®C Cá»¨NG]',
    '1. CHá»ˆ Ä‘Æ°á»£c sá»­ dá»¥ng thÃ´ng tin tá»« tÃ i liá»‡u dÆ°á»›i Ä‘Ã¢y. Tuyá»‡t Ä‘á»‘i khÃ´ng bá»‹a Ä‘áº·t kiáº¿n thá»©c ngoÃ i tÃ i liá»‡u.',
    '2. Náº¿u tÃ i liá»‡u khÃ´ng Ä‘á»§ thÃ´ng tin Ä‘á»ƒ sinh Ä‘á»§ sá»‘ cÃ¢u, hÃ£y tráº£ vá» sá»‘ cÃ¢u cÃ³ thá»ƒ vÃ  Ä‘á»ƒ trá»‘ng pháº§n cÃ²n láº¡i (tráº£ máº£ng rá»—ng [] náº¿u khÃ´ng sinh Ä‘Æ°á»£c cÃ¢u nÃ o).',
    '3. Má»—i cÃ¢u tráº¯c nghiá»‡m cÃ³ Ä‘Ãºng 4 phÆ°Æ¡ng Ã¡n vÃ  chá»‰ má»™t Ä‘Ã¡p Ã¡n Ä‘Ãºng; "correctAnswer" lÃ  chá»¯ cÃ¡i A/B/C/D á»©ng vá»›i Ä‘Ã¡p Ã¡n Ä‘Ãºng.',
    '4. PhÆ°Æ¡ng Ã¡n sai pháº£i há»£p lÃ½ (báº«y nháº­n thá»©c), khÃ´ng quÃ¡ hiá»ƒn nhiÃªn vÃ´ lÃ½.',
    '5. "explanation" lÃ  giáº£i thÃ­ch ngáº¯n gá»n vÃ¬ sao Ä‘Ã¡p Ã¡n Ä‘Ãºng (2-3 cÃ¢u).',
    '6. Náº¿u ná»™i dung chá»©a cÃ´ng thá»©c/toÃ¡n há»c, dÃ¹ng LaTeX trong $...$ hoáº·c $$...$$.',
    '7. KhÃ´ng láº·p láº¡i ná»™i dung cÃ¢u há»i Ä‘Ã£ cÃ³.',
    '',
    `[TÃ€I LIá»†U]`,
    sourceText.slice(0, MAX_SOURCE_CHARS),
    '',
    `[YÃŠU Cáº¦U]`,
    `Sinh ${count} cÃ¢u á»Ÿ má»©c nháº­n thá»©c "${level}" dáº¡ng ${isEssay ? 'Tá»° LUáº¬N (khÃ´ng cÃ³ options, correctAnswer lÃ  dÃ n Ã½ Ä‘Ã¡p Ã¡n)' : 'TRáº®C NGHIá»†M 4 phÆ°Æ¡ng Ã¡n'}.`,
    'Tráº£ vá» JSON array Ä‘Ãºng schema.',
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
    while (options.length < 4) options.push(`PhÆ°Æ¡ng Ã¡n ${String.fromCharCode(65 + options.length)}`);
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
