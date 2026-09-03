import type { CircuitSimulatePlayer, RoomState } from './gameTypes.js';

export function circuitHostRoom(room: RoomState): string {
  return `game-host:${room.sessionId}`;
}

export function circuitSimulateProgressRow(room: RoomState, player: CircuitSimulatePlayer) {
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  const currentCircuit = challenge && player.circuitChallengeId === challenge.id ? player.circuit : null;
  const componentCount = currentCircuit?.components.length ?? 0;
  const wireCount = currentCircuit?.wires.length ?? 0;
  const online = room.players.get(player.userId)?.online ?? false;
  const completedCurrent = !!challenge && player.completedChallenges.includes(challenge.id);
  const status = !online
    ? 'disconnected'
    : completedCurrent
      ? 'completed'
      : componentCount > 0 || wireCount > 0 || player.simulationState !== 'idle'
        ? 'working'
        : 'not_started';
  return {
    userId: player.userId,
    name: player.displayName,
    online,
    status,
    completedCurrent,
    completedCount: player.completedChallenges.length,
    totalChallenges: room.circuitSimulateChallenges.length,
    score: player.score,
    simulationState: player.simulationState,
    componentCount,
    wireCount,
    lastActivityAt: player.lastActivityAt,
    submissionAttempts: player.submissionAttempts,
    totalSubmissionAttempts: player.totalSubmissionAttempts,
    incorrectSubmissionAttempts: player.incorrectSubmissionAttempts,
    lastSubmissionAt: player.lastSubmissionAt,
    lastValidationCode: player.lastValidationCode,
    lastValidationFeedback: player.lastValidationFeedback,
  };
}

export function circuitSimulateProgressSnapshot(room: RoomState) {
  return [...room.circuitSimulatePlayers.values()]
    .map((player) => circuitSimulateProgressRow(room, player))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function circuitSimulateInspection(room: RoomState, player: CircuitSimulatePlayer) {
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  return {
    ...circuitSimulateProgressRow(room, player),
    challengeId: challenge?.id ?? null,
    circuit: challenge && player.circuitChallengeId === challenge.id ? player.circuit : null,
  };
}
