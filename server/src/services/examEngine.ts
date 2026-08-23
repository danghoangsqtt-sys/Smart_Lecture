export interface BankQuestion {
  id: string;
  type: string;
  content: string;
  options_json: string;
  correct_answer: string;
  explanation: string;
  image_path: string | null;
}

export interface PaperQuestion {
  id: string;
  type: string;
  content: string;
  options?: string[];
  image_path?: string | null;
}

export interface AnswerKeyEntry {
  type: string;
  letter: string | null;
  correctText: string | null;
  explanation: string;
}

export interface GeneratedPaper {
  questions: PaperQuestion[];
  key: Record<string, AnswerKeyEntry>;
}

function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const vi = arr[i];
    const vj = arr[j];
    if (vi !== undefined && vj !== undefined) {
      arr[i] = vj;
      arr[j] = vi;
    }
  }
  return arr;
}

const OPTION_PREFIX_RE = /^([A-Fa-f])[\.\:\)]\s+/;

function cleanOptionText(text: string): string {
  return text.replace(OPTION_PREFIX_RE, '');
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').replace(OPTION_PREFIX_RE, (m) => m.slice(0, 1));
}

function resolveCorrectIndex(question: BankQuestion): number {
  const options = JSON.parse(question.options_json) as string[];
  const cleaned = options.map(cleanOptionText);
  const answer = question.correct_answer.trim();
  if (/^[A-Da-d]$/.test(answer)) {
    return answer.toUpperCase().charCodeAt(0) - 65;
  }
  const prefixMatch = answer.match(/^([A-Da-d])[\.\:\)]/);
  const prefixChar = prefixMatch?.[1];
  if (prefixChar) {
    return prefixChar.toUpperCase().charCodeAt(0) - 65;
  }
  const target = normalizeForCompare(answer);
  const exact = cleaned.findIndex((o) => normalizeForCompare(o) === target);
  if (exact >= 0) return exact;
  const partial = cleaned.findIndex((o) => normalizeForCompare(o).includes(target) && target.length > 3);
  if (partial >= 0) return partial;
  return 0;
}

export function generatePaper(
  bank: BankQuestion[],
  config: { shuffleQuestions: boolean; shuffleOptions: boolean }
): GeneratedPaper {
  const ordered = config.shuffleQuestions ? shuffle(bank) : [...bank];
  const questions: PaperQuestion[] = [];
  const key: Record<string, AnswerKeyEntry> = {};

  for (const q of ordered) {
    if (q.type === 'mcq') {
      const options = JSON.parse(q.options_json) as string[];
      const correctIdx = Math.min(resolveCorrectIndex(q), options.length - 1);
      const pairs = options.map((text, idx) => ({ text, idx }));
      if (config.shuffleOptions) shuffle(pairs);
      const newLetterIndex = pairs.findIndex((p) => p.idx === correctIdx);
      const letter = String.fromCharCode(65 + newLetterIndex);
      questions.push({
        id: q.id,
        type: 'mcq',
        content: q.content,
        options: pairs.map((p) => p.text),
        image_path: q.image_path,
      });
      key[q.id] = { type: 'mcq', letter, correctText: options[correctIdx] ?? null, explanation: q.explanation };
    } else {
      questions.push({ id: q.id, type: q.type, content: q.content, image_path: q.image_path });
      key[q.id] = { type: q.type, letter: null, correctText: q.correct_answer || null, explanation: q.explanation };
    }
  }
  return { questions, key };
}
