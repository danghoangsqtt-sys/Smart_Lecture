export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
void sleep;

interface SocketPayload {
  userId: string;
  role: string;
}

export function generateMathProblem(difficulty: number): { text: string; answer: string } {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  let text: string;
  let answer: number;
  if (difficulty <= 1) {
    const a = rand(5, 30);
    const b = rand(5, 30);
    if (Math.random() < 0.5) {
      text = `${a} + ${b}`;
      answer = a + b;
    } else {
      const big = Math.max(a, b);
      const small = Math.min(a, b);
      text = `${big} − ${small}`;
      answer = big - small;
    }
  } else if (difficulty === 2) {
    const mode = rand(0, 2);
    if (mode === 0) {
      const a = rand(3, 12);
      const b = rand(3, 12);
      text = `${a} × ${b}`;
      answer = a * b;
    } else if (mode === 1) {
      const b = rand(2, 12);
      const answerV = rand(2, 12);
      text = `${b * answerV} : ${b}`;
      answer = answerV;
    } else {
      const a = rand(10, 60);
      const b = rand(10, 40);
      const c = rand(5, 25);
      text = `${a} + ${b} − ${c}`;
      answer = a + b - c;
    }
  } else {
    const mode = rand(0, 2);
    if (mode === 0) {
      const a = rand(11, 25);
      const b = rand(6, 19);
      text = `${a} × ${b}`;
      answer = a * b;
    } else if (mode === 1) {
      const a = rand(4, 15);
      const b = rand(4, 15);
      const c = rand(2, 40);
      text = `${a} × ${b} − ${c}`;
      answer = a * b - c;
    } else {
      const b = rand(3, 16);
      const answerV = rand(6, 30);
      const c = rand(3, 20);
      text = `${b * answerV} : ${b} + ${c}`;
      answer = answerV + c;
    }
  }
  return { text, answer: String(answer) };
}

export function generateBingoCard(): number[][] {
  const card: number[][] = [];
  const ranges: [number, number][] = [
    [1, 15], [16, 30], [31, 45], [46, 60], [61, 75]
  ];
  for (let col = 0; col < 5; col++) {
    const range = ranges[col];
    if (!range) continue;
    const [min, max] = range;
    const nums = new Set<number>();
    while (nums.size < 5) {
      nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    card.push([...nums].sort((a, b) => a - b));
  }
  // Free space in center
  if (card[2] && card[2][2] !== undefined) {
    card[2][2] = 0;
  }
  return card;
}

export function checkBingoLines(marked: boolean[][]): number {
  let lines = 0;
  // Rows
  for (let r = 0; r < 5; r++) {
    if (marked[r]!.every((v) => v)) lines++;
  }
  // Cols
  for (let c = 0; c < 5; c++) {
    if (marked.every((row) => row[c])) lines++;
  }
  // Diagonals
  if (marked.every((row, i) => row[i])) lines++;
  if (marked.every((row, i) => row[4 - i])) lines++;
  return lines;
}

export function generateMemoryCards(pairs: number = 12): { id: number; value: string; matched: boolean }[] {
  const values: string[] = [];
  for (let i = 0; i < pairs; i++) {
    const val = String.fromCharCode(65 + i) + String.fromCharCode(97 + i); // Aa, Bb, Cc...
    values.push(val, val);
  }
  return values.sort(() => Math.random() - 0.5).map((v, i) => ({ id: i, value: v, matched: false }));
}

export function scrambleWord(word: string): string {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr.join('');
}

