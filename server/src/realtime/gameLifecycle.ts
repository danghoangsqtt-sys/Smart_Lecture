import type { Server as IOServer } from 'socket.io';

import { db, tx } from '../db/connection.js';
import { buildCircuitLearningDebrief } from './circuitTopology.js';
import type { CircuitDebriefRow, GameQuestion, RoomState } from './gameTypes.js';

type GameLifecycleDeps = {
  getIo: () => IOServer | null;
  broadcastLeaderboard: (room: RoomState) => void;
  broadcastRope: (room: RoomState) => void;
  broadcastHands: (room: RoomState) => void;
  circuitHostRoom: (room: RoomState) => string;
  removeRoom: (roomCode: string) => void;
};

export function createGameLifecycle({
  getIo,
  broadcastLeaderboard,
  broadcastRope,
  broadcastHands,
  circuitHostRoom,
  removeRoom,
}: GameLifecycleDeps) {
  const emitRoom = (room: RoomState, event: string, payload: unknown) => {
    getIo()?.to(`game:${room.roomCode}`).emit(event, payload);
  };

  const finishGame = (room: RoomState): void => {
    room.phase = 'finished';
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;

    let podium: { rank: number; name: string; score: number }[];
    const circuitDebrief = room.gameType === 'circuit_simulate' ? buildCircuitLearningDebrief(room) : null;
    if (room.gameType === 'math_race') {
      podium = [...room.racePlayers.values()]
        .sort((left, right) => right.solved - left.solved || left.startedAt - right.startedAt)
        .slice(0, 20)
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.solved }));
    } else if (room.gameType === 'tug_of_war') {
      const teamScore = (team: 'A' | 'B') =>
        [...room.players.values()].filter((player) => player.team === team).reduce((sum, player) => sum + player.score, 0);
      const winnerTeam: 'A' | 'B' = Math.abs(room.ropePos) >= 100
        ? (room.ropePos > 0 ? 'A' : 'B')
        : teamScore('A') >= teamScore('B') ? 'A' : 'B';
      emitRoom(room, 'tug:result', { winnerTeam, ropePos: Math.round(room.ropePos), teamA: teamScore('A'), teamB: teamScore('B') });
      podium = [...room.players.values()]
        .sort((left, right) => right.score - left.score)
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.score }));
    } else if (room.gameType === 'bingo') {
      podium = [...room.bingoPlayers.values()]
        .sort((left, right) => right.score - left.score)
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.score }));
    } else if (room.gameType === 'memory_match') {
      podium = [...room.memoryPlayers.values()]
        .sort((left, right) => right.score - left.score)
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.score }));
    } else if (room.gameType === 'word_scramble') {
      podium = [...room.wordScramblePlayers.values()]
        .sort((left, right) => right.score - left.score)
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.score }));
    } else if (room.gameType === 'quiz_show') {
      podium = [...room.quizShowPlayers.values()]
        .sort((left, right) => right.score - left.score)
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.score }));
    } else if (room.gameType === 'circuit_simulate') {
      podium = [...room.circuitSimulatePlayers.values()]
        .sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName))
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.score }));
    } else {
      podium = [...room.players.values()]
        .sort((left, right) => right.score - left.score)
        .map((player, index) => ({ rank: index + 1, name: player.displayName, score: player.score }));
    }

    if (circuitDebrief) getIo()?.to(circuitHostRoom(room)).emit('circuit_simulate:learning_debrief', circuitDebrief);
    emitRoom(room, 'game:finished', { podium });

    try {
      const insertResult = db.prepare(`
        INSERT INTO game_results (game_session_id, student_id, score, rank, detail_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(game_session_id, student_id) DO UPDATE SET
          score = excluded.score, rank = excluded.rank, detail_json = excluded.detail_json
      `);
      const nameToPlayer = new Map<string, string>();
      for (const player of room.players.values()) nameToPlayer.set(player.displayName, player.userId);
      for (const player of room.racePlayers.values()) nameToPlayer.set(player.displayName, player.userId);
      for (const player of room.bingoPlayers.values()) nameToPlayer.set(player.displayName, player.userId);
      for (const player of room.memoryPlayers.values()) nameToPlayer.set(player.displayName, player.userId);
      for (const player of room.wordScramblePlayers.values()) nameToPlayer.set(player.displayName, player.userId);
      for (const player of room.quizShowPlayers.values()) nameToPlayer.set(player.displayName, player.userId);
      const circuitResultDetail = (learner: CircuitDebriefRow) => JSON.stringify({
        type: 'circuit_learning_debrief', version: 1,
        completedCount: learner.completedCount, totalChallenges: learner.totalChallenges,
        totalSubmissionAttempts: learner.totalSubmissionAttempts,
        incorrectSubmissionAttempts: learner.incorrectSubmissionAttempts,
      });

      tx(() => {
        if (circuitDebrief) {
          for (const [index, learner] of circuitDebrief.learners.entries()) {
            insertResult.run(room.sessionId, learner.userId, learner.score, index + 1, circuitResultDetail(learner));
          }
        } else {
          for (const entry of podium) {
            const userId = nameToPlayer.get(entry.name);
            if (userId) insertResult.run(room.sessionId, userId, entry.score, entry.rank, '{}');
          }
        }
        db.prepare("UPDATE game_sessions SET status = 'finished', finished_at = datetime('now') WHERE id = ?").run(room.sessionId);
      });
    } catch (error) {
      console.error('[game] persist results failed', error);
    }
    setTimeout(() => removeRoom(room.roomCode), 10 * 60_000);
  };

  const isAnswerCorrect = (question: GameQuestion, choiceIdx: number, text: string | undefined): boolean => {
    if (question.type === 'mcq') return choiceIdx === question.correctIdx;
    const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized(text ?? '').length > 0 && normalized(text ?? '') === normalized(question.correctText ?? '');
  };

  const revealAnswer = (room: RoomState): void => {
    if (room.phase !== 'question') return;
    room.phase = 'leaderboard';
    const question = room.questions[room.currentIndex];
    if (!question) return;
    const totalMs = room.secondsPerQuestion * 1000;
    const counts = new Array(Math.max(question.options?.length ?? 0, 1)).fill(0);
    let correctCount = 0;
    let answeredCount = 0;
    for (const player of room.players.values()) {
      const answer = player.answers.get(room.currentIndex);
      if (!answer) continue;
      answeredCount++;
      answer.correct = isAnswerCorrect(question, answer.choiceIdx, answer.text);
      if (question.type === 'mcq') counts[answer.choiceIdx] = (counts[answer.choiceIdx] ?? 0) + 1;
      if (answer.correct && !answer.earned) {
        const remainingRatio = Math.max(0, (room.questionEndsAt - (room.questionStartAt + answer.msTaken)) / totalMs);
        answer.earned = Math.round(60 + 40 * remainingRatio);
        player.score += answer.earned;
        correctCount++;
      } else if (answer.correct) correctCount++;
    }
    emitRoom(room, 'answer:reveal', {
      index: room.currentIndex,
      correctIdx: question.type === 'mcq' ? question.correctIdx : -1,
      correctText: question.type === 'fill' ? question.correctText : undefined,
      counts, correctCount, playerCount: answeredCount,
    });
    if (room.gameType === 'tug_of_war') {
      const stats = { A: { correct: 0, answered: 0 }, B: { correct: 0, answered: 0 } };
      for (const player of room.players.values()) {
        const answer = player.answers.get(room.currentIndex);
        if (!player.team || !answer) continue;
        const team = stats[player.team];
        team.answered++;
        if (answer.correct) team.correct++;
      }
      const ratioA = stats.A.answered > 0 ? stats.A.correct / stats.A.answered : 0;
      const ratioB = stats.B.answered > 0 ? stats.B.correct / stats.B.answered : 0;
      const delta = Math.max(-35, Math.min(35, Math.round((ratioA - ratioB) * 45)));
      room.ropePos = Math.max(-100, Math.min(100, room.ropePos + delta));
      broadcastRope(room);
    }
    broadcastLeaderboard(room);
    db.prepare('UPDATE game_sessions SET current_question_index = ? WHERE id = ?').run(room.currentIndex, room.sessionId);
  };

  const startQuestion = (room: RoomState): void => {
    if (room.currentIndex >= room.questions.length) {
      finishGame(room);
      return;
    }
    room.phase = 'question';
    room.questionStartAt = Date.now();
    room.questionEndsAt = Date.now() + room.secondsPerQuestion * 1000;
    const question = room.questions[room.currentIndex];
    if (!question) return;
    emitRoom(room, 'question:show', {
      index: room.currentIndex, total: room.questions.length,
      question: { id: question.id, type: question.type, content: question.content, options: question.options ?? [] },
      endsAt: room.questionEndsAt, durationSec: room.secondsPerQuestion,
    });
    if (room.gameType === 'hand_raise') {
      room.hands.clear();
      room.activePick = null;
      broadcastHands(room);
      return;
    }
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => revealAnswer(room), room.secondsPerQuestion * 1000 + 400);
  };

  const nextStep = (room: RoomState): void => {
    room.currentIndex++;
    if ((room.gameType === 'tug_of_war' && Math.abs(room.ropePos) >= 100) || room.currentIndex >= room.questions.length) {
      finishGame(room);
    } else {
      startQuestion(room);
    }
  };

  return { finishGame, revealAnswer, startQuestion, nextStep };
}
