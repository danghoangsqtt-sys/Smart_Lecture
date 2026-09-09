import { db, queryAll } from '../db/connection.js';
import type { GameQuestion, GameType, PuzzleDef, RoomState } from './gameTypes.js';

type RoomStoreDeps = {
  rooms: Map<string, RoomState>;
  initCircuitSimulate: (room: RoomState) => void;
  restoreCircuitSimulateRoom: (room: RoomState) => boolean;
};

export function createRoomStore({ rooms, initCircuitSimulate, restoreCircuitSimulateRoom }: RoomStoreDeps) {
  const loadRoomFromDb = (sessionId: string): RoomState | null => {
    const row = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId) as
      | {
          id: string;
          host_teacher_id: string;
          room_code: string;
          status: string;
          game_type: string;
          question_ids_json: string;
          config_json: string;
          current_question_index: number;
          class_id: string | null;
        }
      | undefined;
    if (!row || row.status === 'finished') return null;

    const cfg = JSON.parse(row.config_json) as {
      secondsPerQuestion?: number;
      durationSec?: number;
      difficulty?: number;
      pointsPerCorrect?: number;
      classId?: string | null;
      puzzle?: PuzzleDef | null;
      circuitTemplate?: { components: unknown[]; wires: unknown[] } | null;
      simulateChallenges?: {
        title: string;
        description?: string;
        targetBehavior?: string;
        points: number;
        circuit?: { components: unknown[]; wires: unknown[] } | null;
      }[] | null;
      lockOnStart?: boolean;
    };
    const gameType = (['quick_quiz', 'tug_of_war', 'math_race', 'hand_raise', 'crossword', 'bingo', 'memory_match', 'word_scramble', 'quiz_show', 'circuit_draw', 'circuit_simulate'] as const).includes(
      row.game_type as never
    )
      ? (row.game_type as GameType)
      : 'quick_quiz';

    let questions: GameQuestion[] = [];
    const ids = JSON.parse(row.question_ids_json) as string[];
    if (ids.length > 0 && gameType !== 'math_race') {
      const placeholders = ids.map(() => '?').join(',');
      const bankRows = queryAll<{ id: string; type: string; content: string; options_json: string; correct_answer: string }>(
        `SELECT id, type, content, options_json, correct_answer FROM questions WHERE id IN (${placeholders})`,
        ...ids
      );
      const orderMap = new Map(ids.map((qid, i) => [qid, i]));
      const sorted = [...bankRows].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      questions = sorted.map((q) => {
        if (q.type === 'fill') {
          return { id: q.id, type: 'fill' as const, content: q.content, correctText: q.correct_answer };
        }
        const rawOptions = (JSON.parse(q.options_json) as string[]).map((o) => o.replace(/^([A-D])[\.\:\)]\s+/, ''));
        let correctIdx = /^[A-D]$/.test(q.correct_answer) ? q.correct_answer.charCodeAt(0) - 65 : 0;
        if (correctIdx < 0 || correctIdx >= rawOptions.length) correctIdx = 0;
        return { id: q.id, type: 'mcq' as const, content: q.content, options: rawOptions, correctIdx };
      });
    }

    const existing = rooms.get(row.room_code);
    if (existing) return existing;
    const room: RoomState = {
      sessionId: row.id,
      hostId: row.host_teacher_id,
      roomCode: row.room_code,
      gameType,
      questions,
      secondsPerQuestion: Math.min(Math.max(cfg.secondsPerQuestion ?? 20, 5), 120),
      raceDurationSec: Math.min(Math.max(cfg.durationSec ?? 120, 30), 600),
      raceDifficulty: Math.min(Math.max(cfg.difficulty ?? 1, 1), 3),
      pointsPerCorrect: cfg.pointsPerCorrect ?? 0.5,
      classId: row.class_id ?? cfg.classId ?? null,
      puzzle: cfg.puzzle ?? null,
      solvedRows: new Set<number>(),
      hands: new Map<string, string>(),
      activePick: null,
      locked: row.status === 'running' && cfg.lockOnStart === true,
      lockOnStart: cfg.lockOnStart === true,
      blacklist: new Set<string>(),
      phase: row.status === 'running'
        ? gameType === 'math_race'
          ? 'race'
          : gameType === 'circuit_simulate'
            ? 'circuit_simulate'
            : 'question'
        : 'lobby',
      currentIndex: row.current_question_index,
      questionEndsAt: 0,
      questionStartAt: 0,
      players: new Map(),
      racePlayers: new Map(),
      ropePos: 0,
      raceEndsAt: 0,
      timer: null,
      // Bingo
      bingoNumbers: [],
      bingoCalled: [],
      bingoPlayers: new Map(),
      // Memory Match
      memoryCards: [],
      memoryPlayers: new Map(),
      memoryFlipped: [],
      // Word Scramble
      wordScrambleWords: [],
      wordScramblePlayers: new Map(),
      // Quiz Show
      quizShowQuestions: [],
      quizShowPlayers: new Map(),
      quizShowCurrentQuestion: 0,
      // Circuit Draw
      circuitDrawPlayers: new Map(),
      circuitDrawReference: null,
      circuitTemplate: cfg.circuitTemplate ?? null,
      // Circuit Simulate
      circuitSimulatePlayers: new Map(),
      circuitSimulateChallenges: [],
      circuitSimulateCurrentChallenge: 0,
      circuitSimulateChallengeEndsAt: 0,
      circuitSimulatePaused: false,
      circuitSimulateRemainingMs: 0,
      simulateChallenges: cfg.simulateChallenges
        ? cfg.simulateChallenges.map((entry, i) => ({
            id: `cfg_${i}`,
            title: entry.title,
            description: entry.description ?? '',
            targetBehavior: entry.targetBehavior ?? '',
            starterCircuit: entry.circuit ?? null,
            referenceCircuit: entry.circuit ?? null,
            testCases: [],
            points: entry.points,
          }))
        : null,
    };
    rooms.set(row.room_code, room);
    if (row.status === 'running' && gameType === 'circuit_simulate') {
      if (!restoreCircuitSimulateRoom(room)) initCircuitSimulate(room);
    }
    return room;
  };

  const loadJoinableRoomByCodeFromDb = (roomCode: string): RoomState | null => {
    const row = db.prepare(`
      SELECT id FROM game_sessions
      WHERE room_code = ?
        AND (status = 'lobby' OR (game_type = 'circuit_simulate' AND status = 'running'))
      LIMIT 1
    `).get(roomCode) as { id: string } | undefined;
    return row ? loadRoomFromDb(row.id) : null;
  };

  const restoreActiveCircuitRooms = (): void => {
    const rows = db.prepare(`
      SELECT id FROM game_sessions
      WHERE game_type = 'circuit_simulate' AND status = 'running'
      ORDER BY created_at
    `).all() as unknown as { id: string }[];
    for (const row of rows) {
      try {
        loadRoomFromDb(row.id);
      } catch (error) {
        console.error(`[game] cannot restore circuit room ${row.id}`, error);
      }
    }
  };

  return { loadRoomFromDb, loadJoinableRoomByCodeFromDb, restoreActiveCircuitRooms };
}
