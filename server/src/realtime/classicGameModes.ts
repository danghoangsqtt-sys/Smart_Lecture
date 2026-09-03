import type { Server as IOServer } from 'socket.io';

import { checkBingoLines, generateBingoCard, generateMemoryCards, scrambleWord } from './gameUtils.js';
import type { RoomState } from './gameTypes.js';

type ClassicGameModesDeps = {
  getIo: () => IOServer | null;
  finishGame: (room: RoomState) => void;
  applyCorrectPoints: (room: RoomState, userId: string, name: string) => number;
  broadcastLeaderboard: (room: RoomState) => void;
};

export function createClassicGameModes({
  getIo,
  finishGame,
  applyCorrectPoints,
  broadcastLeaderboard,
}: ClassicGameModesDeps) {
  const emitRoom = (room: RoomState, event: string, payload: unknown) => {
    getIo()?.to(`game:${room.roomCode}`).emit(event, payload);
  };

  const initBingo = (room: RoomState): void => {
    room.phase = 'bingo';
    room.bingoNumbers = Array.from({ length: 75 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    room.bingoCalled = [];
    room.bingoPlayers = new Map();
    for (const player of room.players.values()) {
      const bingoPlayer = {
        userId: player.userId,
        displayName: player.displayName,
        card: generateBingoCard(),
        marked: Array(5).fill(null).map(() => Array(5).fill(false)),
        lines: 0,
        score: 0,
        bingo: false,
      };
      bingoPlayer.marked[2]![2] = true;
      room.bingoPlayers.set(player.userId, bingoPlayer);
    }
    emitRoom(room, 'bingo:init', {
      players: [...room.bingoPlayers.values()].map((player) => ({
        userId: player.userId,
        name: player.displayName,
        card: player.card,
      })),
    });
    callNextBingoNumber(room);
  };

  const callNextBingoNumber = (room: RoomState): void => {
    if (room.bingoNumbers.length === 0) {
      finishGame(room);
      return;
    }
    const num = room.bingoNumbers.shift()!;
    room.bingoCalled.push(num);
    emitRoom(room, 'bingo:call', { number: num, called: room.bingoCalled });
    room.timer = setTimeout(() => checkBingoLinesForPlayers(room), 3000);
  };

  const checkBingoLinesForPlayers = (room: RoomState): void => {
    for (const [userId, player] of room.bingoPlayers) {
      if (player.bingo) continue;
      const oldLines = player.lines;
      player.lines = checkBingoLines(player.marked);
      if (player.lines >= 5 && !player.bingo) {
        player.bingo = true;
        player.score += 1000;
        const newKttx = applyCorrectPoints(room, userId, player.displayName);
        emitRoom(room, 'bingo:win', { userId, name: player.displayName, lines: player.lines, newKttx });
        broadcastLeaderboard(room);
        finishGame(room);
        return;
      }
      if (player.lines > oldLines) {
        player.score += (player.lines - oldLines) * 100;
        emitRoom(room, 'bingo:lines', { userId, name: player.displayName, lines: player.lines });
      }
    }
    callNextBingoNumber(room);
  };

  const initMemoryMatch = (room: RoomState): void => {
    room.phase = 'memory_match';
    room.memoryCards = generateMemoryCards(12);
    room.memoryPlayers = new Map();
    room.memoryFlipped = [];
    for (const player of room.players.values()) {
      room.memoryPlayers.set(player.userId, {
        userId: player.userId,
        displayName: player.displayName,
        score: 0,
        matches: 0,
        currentFlipped: [],
        lastFlipTime: 0,
      });
    }
    emitRoom(room, 'memory:init', {
      cards: room.memoryCards.map((card) => ({ id: card.id, value: card.matched ? card.value : '?', matched: card.matched })),
      players: [...room.memoryPlayers.values()].map((player) => ({
        userId: player.userId,
        name: player.displayName,
        score: player.score,
        matches: player.matches,
      })),
    });
  };

  const checkMemoryMatch = (room: RoomState, userId: string, cardIndex: number): void => {
    const player = room.memoryPlayers.get(userId);
    if (!player || player.currentFlipped.length >= 2) return;
    const card = room.memoryCards[cardIndex];
    if (!card || card.matched || player.currentFlipped.includes(cardIndex)) return;

    player.currentFlipped.push(cardIndex);
    player.lastFlipTime = Date.now();
    emitRoom(room, 'memory:flip', { userId, name: player.displayName, cardIndex, value: card.value });

    if (player.currentFlipped.length !== 2) return;
    const [idx1, idx2] = player.currentFlipped as [number, number];
    const card1 = room.memoryCards[idx1]!;
    const card2 = room.memoryCards[idx2]!;
    if (card1.value === card2.value) {
      card1.matched = true;
      card2.matched = true;
      player.matches++;
      player.score += 100;
      player.currentFlipped = [];
      emitRoom(room, 'memory:match', { userId, name: player.displayName, cardIndices: [idx1, idx2], value: card1.value });
      if (room.memoryCards.every((entry) => entry.matched)) finishGame(room);
      return;
    }
    emitRoom(room, 'memory:mismatch', { userId, name: player.displayName, cardIndices: [idx1, idx2] });
    room.timer = setTimeout(() => {
      const currentPlayer = room.memoryPlayers.get(userId);
      if (currentPlayer) currentPlayer.currentFlipped = [];
      emitRoom(room, 'memory:hide', { cardIndices: [idx1, idx2] });
    }, 1500);
  };

  const initWordScramble = (room: RoomState): void => {
    room.phase = 'word_scramble';
    room.wordScrambleWords = room.questions.map((question) => ({
      original: question.correctText || question.content,
      scrambled: scrambleWord(question.correctText || question.content),
    }));
    room.wordScramblePlayers = new Map();
    for (const player of room.players.values()) {
      room.wordScramblePlayers.set(player.userId, {
        userId: player.userId,
        displayName: player.displayName,
        score: 0,
        solved: 0,
        currentWord: null,
        currentScrambled: null,
        attempts: 0,
      });
    }
    sendNextWordScramble(room);
  };

  const sendNextWordScramble = (room: RoomState): void => {
    for (const [userId, player] of room.wordScramblePlayers) {
      if (player.solved >= room.wordScrambleWords.length) continue;
      const wordData = room.wordScrambleWords[player.solved]!;
      player.currentWord = wordData.original;
      player.currentScrambled = wordData.scrambled;
      player.attempts = 0;
      const socket = [...(getIo()?.sockets.sockets.values() ?? [])].find(
        (candidate) => candidate.data.userId === userId && candidate.data.role === 'student',
      );
      socket?.emit('word_scramble:next', {
        word: wordData.scrambled,
        index: player.solved,
        total: room.wordScrambleWords.length,
      });
    }
    emitRoom(room, 'word_scramble:update', {
      players: [...room.wordScramblePlayers.values()].map((player) => ({
        userId: player.userId,
        name: player.displayName,
        score: player.score,
        solved: player.solved,
      })),
    });
  };

  const checkWordScramble = (room: RoomState, userId: string, guess: string): void => {
    const player = room.wordScramblePlayers.get(userId);
    if (!player || !player.currentWord) return;
    player.attempts++;
    if (guess.trim().toLowerCase() === player.currentWord.trim().toLowerCase()) {
      const points = Math.max(100, 500 - player.attempts * 50);
      player.score += points;
      player.solved++;
      player.currentWord = null;
      player.currentScrambled = null;
      emitRoom(room, 'word_scramble:correct', { userId, name: player.displayName, points, word: player.currentWord });
      const newKttx = applyCorrectPoints(room, userId, player.displayName);
      emitRoom(room, 'word_scramble:kttx', { userId, name: player.displayName, newKttx });
      broadcastLeaderboard(room);
      sendNextWordScramble(room);
    } else {
      emitRoom(room, 'word_scramble:wrong', { userId, name: player.displayName, attempts: player.attempts });
    }
    if ([...room.wordScramblePlayers.values()].every((entry) => entry.solved >= room.wordScrambleWords.length)) {
      finishGame(room);
    }
  };

  const initQuizShow = (room: RoomState): void => {
    room.phase = 'quiz_show';
    room.quizShowQuestions = room.questions;
    room.quizShowPlayers = new Map();
    room.quizShowCurrentQuestion = 0;
    for (const player of room.players.values()) {
      room.quizShowPlayers.set(player.userId, {
        userId: player.userId,
        displayName: player.displayName,
        score: 0,
        streak: 0,
        lifelines: { fiftyFifty: true, askAudience: true, phoneFriend: true },
        currentQuestion: 0,
        answers: new Map(),
      });
    }
    sendQuizShowQuestion(room);
  };

  const sendQuizShowQuestion = (room: RoomState): void => {
    if (room.quizShowCurrentQuestion >= room.quizShowQuestions.length) {
      finishGame(room);
      return;
    }
    const question = room.quizShowQuestions[room.quizShowCurrentQuestion]!;
    emitRoom(room, 'quiz_show:question', {
      index: room.quizShowCurrentQuestion,
      total: room.quizShowQuestions.length,
      question: { id: question.id, type: question.type, content: question.content, options: question.options ?? [] },
      durationSec: room.secondsPerQuestion,
    });
    room.timer = setTimeout(() => revealQuizShowAnswer(room), room.secondsPerQuestion * 1000 + 400);
  };

  const revealQuizShowAnswer = (room: RoomState): void => {
    if (room.phase !== 'quiz_show') return;
    const question = room.quizShowQuestions[room.quizShowCurrentQuestion];
    if (!question) return;
    for (const player of room.quizShowPlayers.values()) {
      if (player.currentQuestion !== room.quizShowCurrentQuestion) continue;
      const answer = player.answers?.get(room.quizShowCurrentQuestion);
      if (!answer) continue;
      if (answer.choiceIdx === (question.type === 'mcq' ? question.correctIdx : -1)) {
        player.score += room.pointsPerCorrect;
        player.streak++;
      } else {
        player.streak = 0;
      }
    }
    emitRoom(room, 'quiz_show:reveal', {
      index: room.quizShowCurrentQuestion,
      correctIdx: question.type === 'mcq' ? question.correctIdx : -1,
      correctText: question.type === 'fill' ? question.correctText : undefined,
      scores: [...room.quizShowPlayers.values()].map((player) => ({
        userId: player.userId,
        name: player.displayName,
        score: player.score,
        streak: player.streak,
      })),
    });
    broadcastLeaderboard(room);
  };

  const useQuizShowLifeline = (room: RoomState, userId: string, lifeline: 'fiftyFifty' | 'askAudience' | 'phoneFriend'): void => {
    const player = room.quizShowPlayers.get(userId);
    if (!player || !player.lifelines[lifeline]) return;
    player.lifelines[lifeline] = false;
    const question = room.quizShowQuestions[room.quizShowCurrentQuestion];
    if (!question) return;
    if (lifeline === 'fiftyFifty' && question.type === 'mcq' && question.options) {
      const correctIdx = question.correctIdx ?? 0;
      const toRemove = question.options.map((_, index) => index).filter((index) => index !== correctIdx).slice(0, 2);
      emitRoom(room, 'quiz_show:fifty_fifty', {
        userId,
        remaining: question.options.map((option, index) => (toRemove.includes(index) ? '' : option)),
      });
    } else if (lifeline === 'askAudience') {
      const votes = question.options?.map(() => Math.floor(Math.random() * 100)) ?? [];
      const total = votes.reduce((sum, vote) => sum + vote, 0);
      const percentages = votes.map((vote) => Math.round((vote / (total || 1)) * 100));
      if (question.correctIdx !== undefined && percentages.length > question.correctIdx) percentages[question.correctIdx]! += 20;
      emitRoom(room, 'quiz_show:ask_audience', { userId, percentages });
    } else if (lifeline === 'phoneFriend') {
      const hint = question.type === 'mcq' && question.correctIdx !== undefined
        ? `Tôi nghĩ đáp án ${String.fromCharCode(65 + question.correctIdx)} có khả năng cao`
        : 'Tôi không chắc lắm, nhưng bạn nên suy nghĩ kỹ hơn';
      emitRoom(room, 'quiz_show:phone_friend', { userId, hint });
    }
  };

  const nextQuizShowQuestion = (room: RoomState): void => {
    room.quizShowCurrentQuestion++;
    if (room.quizShowCurrentQuestion >= room.quizShowQuestions.length) {
      finishGame(room);
      return;
    }
    for (const player of room.quizShowPlayers.values()) player.currentQuestion = room.quizShowCurrentQuestion;
    sendQuizShowQuestion(room);
  };

  return { initBingo, initMemoryMatch, checkMemoryMatch, initWordScramble, checkWordScramble, initQuizShow, useQuizShowLifeline, nextQuizShowQuestion };
}
