export interface ParsedQuestion {
  content: string;
  type: 'mcq' | 'essay';
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  warnings: string[];
}

const QUESTION_RE = /^c[âa]u\s*(\d+)\s*[:\.]?\s*(.*)/i;
const OPTION_RE = /^([A-Ha-h])\s*[\.\:\)]\s*(.*)$/;
const ANSWER_ZONE_RE = /^(đáp án|dap án|dap an|đáp an|hướng dẫn giải|huong dan giai|giải thích|giai thich)\s*[:\-]?/i;
const ESSAY_PART_RE = /phần\s*(ii|2)|phan\s*(ii|2)|tự luận|tu luan/i;
const MCQ_PART_RE = /phần\s*(i\b|1)|phan\s*(i\b|1)/i;
const ANSWER_TABLE_RE = /^(?:\s*\d{1,3}\s*[A-Ha-h][\s,;\.]*){2,}$/;

function isVietnameseLetter(char: string): boolean {
  return /[A-Ha-h]/.test(char);
}

export function parseExamText(input: string): ParseResult {
  const lines = input.split(/\r?\n/);
  const questions: ParsedQuestion[] = [];
  const warnings: string[] = [];
  let current: ParsedQuestion | null = null;
  let inEssayPart = false;
  let answerTable: Record<number, string> = {};
  let collectingExplanation = false;

  const flushCurrent = (): void => {
    if (current) questions.push(current);
    current = null;
    collectingExplanation = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (MCQ_PART_RE.test(line) && !ESSAY_PART_RE.test(line)) {
      inEssayPart = false;
      continue;
    }
    if (ESSAY_PART_RE.test(line)) {
      flushCurrent();
      inEssayPart = true;
      continue;
    }

    if (ANSWER_TABLE_RE.test(line)) {
      const tokens = line.matchAll(/(\d{1,3})\s*([A-Ha-h])/g);
      for (const t of tokens) {
        if (t[1] && t[2]) answerTable[Number(t[1])] = t[2].toUpperCase();
      }
      continue;
    }

    const qMatch = line.match(QUESTION_RE);
    if (qMatch && !OPTION_RE.test(line)) {
      flushCurrent();
      current = {
        content: qMatch[2]?.trim() ?? '',
        type: inEssayPart ? 'essay' : 'mcq',
        options: [],
        correctAnswer: '',
        explanation: '',
      };
      collectingExplanation = false;
      continue;
    }

    const optMatch = !inEssayPart ? line.match(OPTION_RE) : null;
    const optLetter = optMatch?.[1];
    if (optMatch && current && optLetter && isVietnameseLetter(optLetter)) {
      current.options.push(`${optLetter.toUpperCase()}. ${optMatch[2]?.trim() ?? ''}`);
      collectingExplanation = false;
      continue;
    }

    if (!current) continue;

    if (ANSWER_ZONE_RE.test(line)) {
      collectingExplanation = true;
      const starLetter1 = line.match(/\*\s*([A-Da-d])\b/)?.[1];
      if (starLetter1 && current.type === 'mcq') {
        current.correctAnswer = starLetter1.toUpperCase();
      }
      const rest = line.replace(ANSWER_ZONE_RE, '').replace(/\*\s*[A-Da-d]\b/, '').trim();
      if (rest) current.explanation += (current.explanation ? ' ' : '') + rest;
      continue;
    }

    if (collectingExplanation || current.options.length === 4 || current.type === 'essay') {
      const starLetter2 = line.match(/\*\s*([A-Da-d])\b/)?.[1];
      if (starLetter2 && current.type === 'mcq' && !current.correctAnswer) {
        current.correctAnswer = starLetter2.toUpperCase();
      }
      current.explanation += (current.explanation ? ' ' : '') + line;
    } else {
      current.content += '\n' + line;
    }
  }
  flushCurrent();

  for (const [numStr, letter] of Object.entries(answerTable)) {
    const idx = Number(numStr) - 1;
    const q = questions[idx];
    if (q && q.type === 'mcq') {
      q.correctAnswer = letter;
    } else if (!q) {
      warnings.push(`Bảng đáp án có câu ${numStr} nhưng đề chỉ có ${questions.length} câu`);
    }
  }

  questions.forEach((q, i) => {
    if (q.type === 'mcq') {
      if (q.options.length !== 4) {
        warnings.push(`Câu ${i + 1}: số phương án ${q.options.length} (khác 4)`);
      }
      if (!/^[A-D]$/.test(q.correctAnswer)) {
        warnings.push(`Câu ${i + 1}: không xác định được đáp án đúng`);
      }
    }
    if (!q.content.trim()) warnings.push(`Câu ${i + 1}: nội dung rỗng`);
  });

  return { questions, warnings };
}
