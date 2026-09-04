import { tx } from '../db/connection.js';
import type { CircuitChallenge, CircuitSimulatePlayer, RoomState } from './gameTypes.js';

export function createCircuitScoring({
  applyCorrectPoints,
  persistCircuitPlayer,
}: {
  applyCorrectPoints: (room: RoomState, userId: string, name: string) => number;
  persistCircuitPlayer: (room: RoomState, player: CircuitSimulatePlayer) => void;
}) {
  const completeCircuitChallenge = (
    room: RoomState,
    player: CircuitSimulatePlayer,
    challenge: CircuitChallenge,
  ): number | null => {
    if (player.completedChallenges.includes(challenge.id)) return null;
    const genericPlayer = room.players.get(player.userId);
    const previousCircuitScore = player.score;
    const previousGenericScore = genericPlayer?.score ?? 0;
    player.completedChallenges.push(challenge.id);
    player.score += challenge.points;
    try {
      let newKttx = 0;
      tx(() => {
        newKttx = applyCorrectPoints(room, player.userId, player.displayName);
        persistCircuitPlayer(room, player);
      });
      return newKttx;
    } catch (error) {
      player.completedChallenges = player.completedChallenges.filter((challengeId) => challengeId !== challenge.id);
      player.score = previousCircuitScore;
      if (genericPlayer) genericPlayer.score = previousGenericScore;
      throw error;
    }
  };

  return { completeCircuitChallenge };
}
