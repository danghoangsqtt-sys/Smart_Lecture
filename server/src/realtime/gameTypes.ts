export interface PuzzleDef {
  keyword: string;
  rows: { clue: string; word: string }[];
}

export type GameType = 'quick_quiz' | 'tug_of_war' | 'math_race' | 'hand_raise' | 'crossword' | 'bingo' | 'memory_match' | 'word_scramble' | 'quiz_show' | 'circuit_draw' | 'circuit_simulate';

export interface GameQuestion {
  id: string;
  type: 'mcq' | 'fill';
  content: string;
  options?: string[];
  correctIdx?: number;
  correctText?: string;
}

export interface PlayerInfo {
  userId: string;
  displayName: string;
  score: number;
  team?: 'A' | 'B';
  answers: Map<number, { choiceIdx: number; text?: string; msTaken: number; correct: boolean; earned: number }>;
  online: boolean;
}

export interface RacePlayer {
  userId: string;
  displayName: string;
  solved: number;
  wrongStreak: number;
  current: { text: string; answer: string } | null;
  startedAt: number;
}

export interface BingoPlayer {
  userId: string;
  displayName: string;
  card: number[][]; // 5x5 card with numbers
  marked: boolean[][]; // 5x5 marked cells
  lines: number; // completed lines (row, col, diag)
  score: number;
  bingo: boolean;
}

export interface MemoryMatchPlayer {
  userId: string;
  displayName: string;
  score: number;
  matches: number;
  currentFlipped: number[]; // indices of currently flipped cards
  lastFlipTime: number;
}

export interface WordScramblePlayer {
  userId: string;
  displayName: string;
  score: number;
  solved: number;
  currentWord: string | null;
  currentScrambled: string | null;
  attempts: number;
}

export interface QuizShowPlayer {
  userId: string;
  displayName: string;
  score: number;
  streak: number;
  lifelines: { fiftyFifty: boolean; askAudience: boolean; phoneFriend: boolean };
  currentQuestion: number;
  answers: Map<number, { choiceIdx: number; lifeline?: string }>;
}

export interface CircuitDrawPlayer {
  userId: string;
  displayName: string;
  score: number;
  circuit: { components: any[]; wires: any[] } | null;
  submitted: boolean;
  verified: boolean;
  feedback: string;
}

export type CircuitValidationCode = 'correct' | 'invalid_data' | 'wire_count' | 'component_count' | 'connection';

export interface CircuitSimulatePlayer {
  userId: string;
  displayName: string;
  score: number;
  circuit: { components: any[]; wires: any[] } | null;
  circuitChallengeId: string | null;
  simulationState: 'idle' | 'running' | 'paused' | 'completed' | 'start' | 'stop' | 'step' | 'reset';
  measurements: Record<string, number>;
  completedChallenges: string[];
  lastActivityAt: number;
  submissionAttempts: number;
  lastSubmissionAt: number | null;
  lastValidationCode: CircuitValidationCode | null;
  lastValidationFeedback: string | null;
  totalSubmissionAttempts: number;
  incorrectSubmissionAttempts: number;
}
export interface CircuitDebriefRow {
  userId: string;
  name: string;
  completedCount: number;
  totalChallenges: number;
  totalSubmissionAttempts: number;
  incorrectSubmissionAttempts: number;
  score: number;
}

export interface CircuitLearningDebrief {
  summary: {
    learnerCount: number;
    completedAllCount: number;
    totalCompletions: number;
    totalPossible: number;
    totalSubmissionAttempts: number;
    incorrectSubmissionAttempts: number;
    completionRate: number;
  };
  learners: CircuitDebriefRow[];
}

export type Phase = 'lobby' | 'question' | 'leaderboard' | 'race' | 'crossword' | 'bingo' | 'memory_match' | 'word_scramble' | 'quiz_show' | 'circuit_draw' | 'circuit_simulate' | 'finished';

export interface RoomState {
  sessionId: string;
  hostId: string;
  roomCode: string;
  gameType: GameType;
  questions: GameQuestion[];
  secondsPerQuestion: number;
  raceDurationSec: number;
  raceDifficulty: number;
  pointsPerCorrect: number;
  classId: string | null;
  puzzle: PuzzleDef | null;
  solvedRows: Set<number>;
  hands: Map<string, string>;
  activePick: { userId: string; name: string } | null;
  locked: boolean;
  lockOnStart: boolean;
  blacklist: Set<string>;
  phase: Phase;
  currentIndex: number;
  questionEndsAt: number;
  questionStartAt: number;
  players: Map<string, PlayerInfo>;
  racePlayers: Map<string, RacePlayer>;
  ropePos: number;
  raceEndsAt: number;
  timer: NodeJS.Timeout | null;
  // Bingo
  bingoNumbers: number[];
  bingoCalled: number[];
  bingoPlayers: Map<string, BingoPlayer>;
  // Memory Match
  memoryCards: { id: number; value: string; matched: boolean }[];
  memoryPlayers: Map<string, MemoryMatchPlayer>;
  memoryFlipped: number[];
  // Word Scramble
  wordScrambleWords: { original: string; scrambled: string }[];
  wordScramblePlayers: Map<string, WordScramblePlayer>;
  // Quiz Show
  quizShowQuestions: GameQuestion[];
  quizShowPlayers: Map<string, QuizShowPlayer>;
  quizShowCurrentQuestion: number;
  // Circuit Draw
  circuitDrawPlayers: Map<string, CircuitDrawPlayer>;
  circuitDrawReference: { components: any[]; wires: any[] } | null;
  circuitTemplate: { components: unknown[]; wires: unknown[] } | null;
  // Circuit Simulate
  circuitSimulatePlayers: Map<string, CircuitSimulatePlayer>;
  circuitSimulateChallenges: CircuitChallenge[];
  circuitSimulateCurrentChallenge: number;
  circuitSimulateChallengeEndsAt: number;
  circuitSimulatePaused: boolean;
  circuitSimulateRemainingMs: number;
  simulateChallenges: CircuitChallenge[] | null;
}

export interface CircuitChallenge {
  id: string;
  title: string;
  description: string;
  starterCircuit: { components: any[]; wires: any[] } | null;
  referenceCircuit?: unknown;
  targetBehavior: string; // e.g., "LED blinks at 1Hz", "Output HIGH when A=1 AND B=1"
  testCases: { inputs: Record<string, number>; expectedOutputs: Record<string, number> }[];
  points: number;
}
