import type { Server as IOServer, Socket } from 'socket.io';

import { configureCircuitSimulateChallenges } from './circuitChallenges.js';
import { circuitHostRoom, circuitSimulateInspection, circuitSimulateProgressRow, circuitSimulateProgressSnapshot } from './circuitMonitoring.js';
import { persistCircuitPlayer, persistCircuitRoom, persistCircuitRuntime } from './circuitPersistence.js';
import { circuitsMatch } from './circuitTopology.js';
import type { CircuitHostControlAction } from './gameSchemas.js';
import type { CircuitChallenge, CircuitSimulatePlayer, RoomState } from './gameTypes.js';

const CIRCUIT_EXTENSION_MS = 30_000;
const CIRCUIT_MAX_REMAINING_MS = 10 * 60_000;

type CircuitSimulateRuntimeDeps = {
  getIo: () => IOServer | null;
  finishGame: (room: RoomState) => void;
  completeCircuitChallenge: (room: RoomState, player: CircuitSimulatePlayer, challenge: CircuitChallenge) => number | null;
  broadcastLeaderboard: (room: RoomState) => void;
  circuitAssistanceSnapshot: (room: RoomState) => unknown[];
  deliverPendingCircuitAssistance: (room: RoomState, socket: Socket, userId: string) => void;
};

export function createCircuitSimulateRuntime({
  getIo,
  finishGame,
  completeCircuitChallenge,
  broadcastLeaderboard,
  circuitAssistanceSnapshot,
  deliverPendingCircuitAssistance,
}: CircuitSimulateRuntimeDeps) {
  const circuitInspectionSubscriptions = new Map<string, { roomCode: string; userId: string }>();

  const subscribeInspection = (socketId: string, roomCode: string, userId: string): void => {
    circuitInspectionSubscriptions.set(socketId, { roomCode, userId });
  };

  const unsubscribeInspection = (socketId: string): void => {
    circuitInspectionSubscriptions.delete(socketId);
  };

  const clearTimer = (room: RoomState): void => {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  };

  const challengePayload = (room: RoomState) => {
    const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
    if (!challenge) return null;
    return {
      index: room.circuitSimulateCurrentChallenge,
      total: room.circuitSimulateChallenges.length,
      endsAt: room.circuitSimulateChallengeEndsAt,
      paused: room.circuitSimulatePaused,
      remainingMs: room.circuitSimulatePaused
        ? room.circuitSimulateRemainingMs
        : Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()),
      challenge: {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        starterCircuit: challenge.starterCircuit,
        targetBehavior: challenge.targetBehavior,
      },
    };
  };

  const emitControlState = (room: RoomState): void => {
    getIo()?.to(`game:${room.roomCode}`).emit('circuit_simulate:control_state', {
      index: room.circuitSimulateCurrentChallenge,
      paused: room.circuitSimulatePaused,
      remainingMs: room.circuitSimulatePaused
        ? room.circuitSimulateRemainingMs
        : Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()),
      endsAt: room.circuitSimulateChallengeEndsAt,
    });
  };

  const scheduleTimer = (room: RoomState): void => {
    clearTimer(room);
    if (room.circuitSimulatePaused) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      if (room.circuitSimulatePaused || room.phase !== 'circuit_simulate') return;
      evaluateChallenge(room);
    }, Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()));
  };

  const emitProgress = (room: RoomState, player: CircuitSimulatePlayer): void => {
    getIo()?.to(circuitHostRoom(room)).emit(
      'circuit_simulate:progress',
      circuitSimulateProgressRow(room, player),
    );
  };

  const emitProgressSnapshot = (room: RoomState): void => {
    getIo()?.to(circuitHostRoom(room)).emit(
      'circuit_simulate:progress_snapshot',
      { rows: circuitSimulateProgressSnapshot(room) },
    );
  };

  const emitInspectionUpdate = (room: RoomState, player: CircuitSimulatePlayer): void => {
    const io = getIo();
    if (!io) return;
    const payload = circuitSimulateInspection(room, player);
    for (const [socketId, subscription] of circuitInspectionSubscriptions) {
      if (subscription.roomCode !== room.roomCode || subscription.userId !== player.userId) continue;
      io.sockets.sockets.get(socketId)?.emit('circuit_simulate:inspection_update', payload);
    }
  };

  const hostSnapshot = (room: RoomState) => {
    if (room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return null;
    const activeChallenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
    if (!activeChallenge) return null;
    const challengeById = new Map(
      room.circuitSimulateChallenges.map((challenge, index) => [challenge.id, { challenge, index }] as const),
    );
    const passes = [...room.circuitSimulatePlayers.values()]
      .flatMap((player) => player.completedChallenges.flatMap((challengeId) => {
        const matched = challengeById.get(challengeId);
        return matched ? [{
          userId: player.userId,
          name: player.displayName,
          challengeId,
          points: matched.challenge.points,
          challengeIndex: matched.index,
        }] : [];
      }))
      .sort((a, b) => b.challengeIndex - a.challengeIndex || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((pass) => ({
        userId: pass.userId,
        name: pass.name,
        challengeId: pass.challengeId,
        points: pass.points,
      }));

    return {
      challenge: {
        index: room.circuitSimulateCurrentChallenge,
        total: room.circuitSimulateChallenges.length,
        endsAt: room.circuitSimulateChallengeEndsAt,
        paused: room.circuitSimulatePaused,
        remainingMs: room.circuitSimulatePaused
          ? room.circuitSimulateRemainingMs
          : Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()),
        title: activeChallenge.title,
        description: activeChallenge.description,
        targetBehavior: activeChallenge.targetBehavior,
      },
      passes,
      progress: circuitSimulateProgressSnapshot(room),
      assistance: circuitAssistanceSnapshot(room),
    };
  };

  const init = (room: RoomState): void => {
    room.phase = 'circuit_simulate';
    room.circuitSimulatePlayers = new Map();
    configureCircuitSimulateChallenges(room);
    room.circuitSimulateCurrentChallenge = 0;
    room.circuitSimulatePaused = false;
    room.circuitSimulateRemainingMs = 0;
    for (const player of room.players.values()) {
      room.circuitSimulatePlayers.set(player.userId, {
        userId: player.userId,
        displayName: player.displayName,
        score: 0,
        circuit: null,
        circuitChallengeId: room.circuitSimulateChallenges[0]?.id ?? null,
        simulationState: 'idle',
        measurements: {},
        completedChallenges: [],
        lastActivityAt: Date.now(),
        submissionAttempts: 0,
        lastSubmissionAt: null,
        lastValidationCode: null,
        lastValidationFeedback: null,
        totalSubmissionAttempts: 0,
        incorrectSubmissionAttempts: 0,
      });
    }
    sendChallenge(room);
  };

  const sendChallenge = (
    room: RoomState,
    challengeEndsAt = Date.now() + room.secondsPerQuestion * 1000,
    resetCurrentChallenge = false,
  ): void => {
    if (room.circuitSimulateCurrentChallenge >= room.circuitSimulateChallenges.length) {
      finishGame(room);
      return;
    }
    const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
    if (!challenge) return;
    const resetAt = Date.now();
    for (const player of room.circuitSimulatePlayers.values()) {
      if (!resetCurrentChallenge && player.circuitChallengeId === challenge.id) continue;
      player.circuit = null;
      player.circuitChallengeId = challenge.id;
      player.measurements = {};
      player.simulationState = 'idle';
      player.lastActivityAt = resetAt;
      player.submissionAttempts = 0;
      player.lastSubmissionAt = null;
      player.lastValidationCode = null;
      player.lastValidationFeedback = null;
    }
    room.circuitSimulatePaused = false;
    room.circuitSimulateRemainingMs = 0;
    room.circuitSimulateChallengeEndsAt = challengeEndsAt;
    persistCircuitRoom(room);
    const payload = challengePayload(room);
    if (payload) getIo()?.to(`game:${room.roomCode}`).emit('circuit_simulate:challenge', payload);
    emitProgressSnapshot(room);
    for (const player of room.circuitSimulatePlayers.values()) {
      emitInspectionUpdate(room, player);
    }
    scheduleTimer(room);
  };

  const syncLearner = (room: RoomState, socket: Socket, userId: string, displayName: string): void => {
    if (room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
    const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
    if (!challenge) return;
    let player = room.circuitSimulatePlayers.get(userId);
    if (!player) {
      player = {
        userId,
        displayName,
        score: 0,
        circuit: null,
        circuitChallengeId: challenge.id,
        simulationState: 'idle',
        measurements: {},
        completedChallenges: [],
        lastActivityAt: Date.now(),
        submissionAttempts: 0,
        lastSubmissionAt: null,
        lastValidationCode: null,
        lastValidationFeedback: null,
        totalSubmissionAttempts: 0,
        incorrectSubmissionAttempts: 0,
      };
      room.circuitSimulatePlayers.set(userId, player);
      persistCircuitPlayer(room, player);
    }
    const circuit = player.circuitChallengeId === challenge.id ? player.circuit : null;
    const payload = challengePayload(room);
    if (payload) socket.emit('circuit_simulate:challenge', payload);
    socket.emit('circuit_simulate:restored', {
      circuit,
      completed: player.completedChallenges.includes(challenge.id),
      simulationState: player.simulationState,
      validation: player.lastValidationCode && player.lastValidationFeedback && player.lastSubmissionAt !== null
        ? {
            correct: player.lastValidationCode === 'correct',
            code: player.lastValidationCode,
            feedback: player.lastValidationFeedback,
            attempts: player.submissionAttempts,
            submittedAt: player.lastSubmissionAt,
          }
        : null,
    });
    deliverPendingCircuitAssistance(room, socket, userId);
  };

  const evaluateChallenge = (room: RoomState): void => {
    const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
    if (!challenge) return;
    const c = challenge; // TypeScript narrowing workaround
    let completed = 0;
    for (const [userId, player] of room.circuitSimulatePlayers) {
      if (player.completedChallenges.includes(c.id)) continue;

      let passed = false;
      if (c.referenceCircuit) {
        /* Chấm tự động theo topology — giống circuit_draw */
        passed = !!player.circuit && circuitsMatch(player.circuit, c.referenceCircuit);
      } else if (player.circuit && player.measurements) {
        /* Fallback legacy: đo lường từ client */
        passed = true;
        for (const testCase of c.testCases) {
          for (const [output, expected] of Object.entries(testCase.expectedOutputs)) {
            const measured = player.measurements[output];
            if (measured === undefined || Math.abs(measured - expected) > 0.1) {
              passed = false;
              break;
            }
          }
          if (!passed) break;
        }
      }

      if (passed) {
        const newKttx = completeCircuitChallenge(room, player, c);
        if (newKttx === null) continue;
        completed++;
        getIo()?.to(`game:${room.roomCode}`).emit('circuit_simulate:challenge_passed', {
          userId,
          name: player.displayName,
          challengeId: c.id,
          points: c.points,
          newKttx,
        });
      }
    }
    broadcastLeaderboard(room);
    if (completed > 0) {
      getIo()?.to(`game:${room.roomCode}`).emit('circuit_simulate:results', { completed });
    }
    persistCircuitRoom(room);
    nextChallenge(room);
  };

  const nextChallenge = (room: RoomState): void => {
    room.circuitSimulateCurrentChallenge++;
    if (room.circuitSimulateCurrentChallenge >= room.circuitSimulateChallenges.length) {
      finishGame(room);
      return;
    }
    sendChallenge(room);
  };

  const control = (room: RoomState, action: CircuitHostControlAction): void => {
    if (action === 'pause') {
      if (!room.circuitSimulatePaused) {
        room.circuitSimulateRemainingMs = Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now());
        room.circuitSimulatePaused = true;
        clearTimer(room);
        persistCircuitRuntime(room);
      }
      emitControlState(room);
      return;
    }
    if (action === 'resume') {
      if (room.circuitSimulatePaused) {
        room.circuitSimulateChallengeEndsAt = Date.now() + room.circuitSimulateRemainingMs;
        room.circuitSimulatePaused = false;
        room.circuitSimulateRemainingMs = 0;
        persistCircuitRuntime(room);
        scheduleTimer(room);
      }
      emitControlState(room);
      return;
    }
    if (action === 'extend') {
      const now = Date.now();
      if (room.circuitSimulatePaused) {
        room.circuitSimulateRemainingMs = Math.min(
          CIRCUIT_MAX_REMAINING_MS,
          Math.max(0, room.circuitSimulateRemainingMs) + CIRCUIT_EXTENSION_MS,
        );
      } else {
        const extendedRemaining = Math.min(
          CIRCUIT_MAX_REMAINING_MS,
          Math.max(0, room.circuitSimulateChallengeEndsAt - now) + CIRCUIT_EXTENSION_MS,
        );
        room.circuitSimulateChallengeEndsAt = now + extendedRemaining;
        scheduleTimer(room);
      }
      persistCircuitRuntime(room);
      emitControlState(room);
      return;
    }
    if (action === 'evaluate') {
      clearTimer(room);
      evaluateChallenge(room);
      return;
    }
    if (action === 'skip') {
      clearTimer(room);
      nextChallenge(room);
      return;
    }
    sendChallenge(
      room,
      Date.now() + room.secondsPerQuestion * 1000,
      true,
    );
  };

  return {
    subscribeInspection,
    unsubscribeInspection,
    clearTimer,
    scheduleTimer,
    init,
    sendChallenge,
    syncLearner,
    control,
    hostSnapshot,
    emitProgress,
    emitProgressSnapshot,
    emitInspectionUpdate,
  };
}
