import { db, tx } from '../db/connection.js';
import type { CircuitSimulatePlayer, CircuitValidationCode, RoomState } from './gameTypes.js';

export interface CircuitRuntimeRow {
  challenge_index: number;
  challenge_ends_at: number;
  is_paused: number;
  remaining_ms: number;
}

export interface CircuitPlayerStateRow {
  student_id: string;
  display_name: string;
  score: number;
  circuit_json: string | null;
  circuit_challenge_id: string | null;
  simulation_state: CircuitSimulatePlayer['simulationState'];
  measurements_json: string;
  completed_challenges_json: string;
  last_activity_at: number;
  submission_attempts: number;
  last_submission_at: number | null;
  last_validation_code: CircuitValidationCode | null;
  last_validation_feedback: string | null;
  total_submission_attempts: number;
  incorrect_submission_attempts: number;
}

function createCircuitPersistenceStatements() {
  return {
    upsertRuntime: db.prepare(`
      INSERT INTO game_circuit_runtime (
        game_session_id, challenge_index, challenge_ends_at, is_paused, remaining_ms, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(game_session_id) DO UPDATE SET
        challenge_index = excluded.challenge_index,
        challenge_ends_at = excluded.challenge_ends_at,
        is_paused = excluded.is_paused,
        remaining_ms = excluded.remaining_ms,
        updated_at = datetime('now')
    `),
    upsertPlayer: db.prepare(`
      INSERT INTO game_circuit_player_states (
        game_session_id, student_id, display_name, score, circuit_json, circuit_challenge_id,
        simulation_state, measurements_json, completed_challenges_json, last_activity_at,
        submission_attempts, last_submission_at, last_validation_code, last_validation_feedback,
        total_submission_attempts, incorrect_submission_attempts, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(game_session_id, student_id) DO UPDATE SET
        display_name = excluded.display_name,
        score = excluded.score,
        circuit_json = excluded.circuit_json,
        circuit_challenge_id = excluded.circuit_challenge_id,
        simulation_state = excluded.simulation_state,
        measurements_json = excluded.measurements_json,
        completed_challenges_json = excluded.completed_challenges_json,
        last_activity_at = excluded.last_activity_at,
        submission_attempts = excluded.submission_attempts,
        last_submission_at = excluded.last_submission_at,
        last_validation_code = excluded.last_validation_code,
        last_validation_feedback = excluded.last_validation_feedback,
        total_submission_attempts = excluded.total_submission_attempts,
        incorrect_submission_attempts = excluded.incorrect_submission_attempts,
        updated_at = datetime('now')
    `),
  };
}

let circuitPersistenceStatements: ReturnType<typeof createCircuitPersistenceStatements> | null = null;

function getCircuitPersistenceStatements() {
  circuitPersistenceStatements ??= createCircuitPersistenceStatements();
  return circuitPersistenceStatements;
}

export function persistCircuitRuntime(room: RoomState): void {
  getCircuitPersistenceStatements().upsertRuntime.run(
    room.sessionId,
    room.circuitSimulateCurrentChallenge,
    room.circuitSimulateChallengeEndsAt,
    room.circuitSimulatePaused ? 1 : 0,
    Math.max(0, Math.trunc(room.circuitSimulateRemainingMs)),
  );
}

export function persistCircuitPlayer(room: RoomState, player: CircuitSimulatePlayer): void {
  getCircuitPersistenceStatements().upsertPlayer.run(
    room.sessionId,
    player.userId,
    player.displayName,
    player.score,
    player.circuit ? JSON.stringify(player.circuit) : null,
    player.circuitChallengeId,
    player.simulationState,
    JSON.stringify(player.measurements),
    JSON.stringify(player.completedChallenges),
    Math.max(0, Math.trunc(player.lastActivityAt)),
    Math.max(0, Math.trunc(player.submissionAttempts)),
    player.lastSubmissionAt === null ? null : Math.max(0, Math.trunc(player.lastSubmissionAt)),
    player.lastValidationCode,
    player.lastValidationFeedback,
    Math.max(0, Math.trunc(player.totalSubmissionAttempts)),
    Math.max(0, Math.trunc(player.incorrectSubmissionAttempts)),
  );
}

export function persistCircuitRoom(room: RoomState): void {
  tx(() => {
    persistCircuitRuntime(room);
    for (const player of room.circuitSimulatePlayers.values()) persistCircuitPlayer(room, player);
  });
}

export function parsePersistedJson(raw: string | null, fallback: unknown): unknown {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}
