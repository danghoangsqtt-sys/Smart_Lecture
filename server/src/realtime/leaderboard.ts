import type { RoomState } from './gameTypes.js';

export function buildLeaderboard(room: RoomState): { name: string; score: number; team?: string }[] {
  if (room.gameType === 'circuit_simulate') {
    return [...room.circuitSimulatePlayers.values()]
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
      .slice(0, 15)
      .map((player) => ({ name: player.displayName, score: player.score }));
  }
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((player) => ({ name: player.displayName, score: player.score, team: player.team }));
}
