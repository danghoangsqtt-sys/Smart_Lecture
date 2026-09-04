import { db } from '../db/connection.js';
import { configureCircuitSimulateChallenges } from './circuitChallenges.js';
import { parsePersistedJson } from './circuitPersistence.js';
import { zCircuitDraw, zCompletedChallenges, zMeasurements } from './gameSchemas.js';
import type { CircuitPlayerStateRow, CircuitRuntimeRow } from './circuitPersistence.js';
import type { CircuitSimulatePlayer, RoomState } from './gameTypes.js';

export function createCircuitRecovery({
  clearTimer,
  scheduleTimer,
}: {
  clearTimer: (room: RoomState) => void;
  scheduleTimer: (room: RoomState) => void;
}) {
  const restoreCircuitSimulateRoom = (room: RoomState): boolean => {
    const runtime = db.prepare(
      `SELECT challenge_index, challenge_ends_at, is_paused, remaining_ms
       FROM game_circuit_runtime WHERE game_session_id = ?`,
    ).get(room.sessionId) as CircuitRuntimeRow | undefined;
    if (!runtime) return false;

    configureCircuitSimulateChallenges(room);
    if (room.circuitSimulateChallenges.length === 0) return false;
    room.phase = 'circuit_simulate';
    room.circuitSimulateCurrentChallenge = Math.min(
      Math.max(Math.trunc(runtime.challenge_index), 0),
      room.circuitSimulateChallenges.length - 1,
    );
    room.circuitSimulateChallengeEndsAt = Number.isFinite(runtime.challenge_ends_at) && runtime.challenge_ends_at > 0
      ? runtime.challenge_ends_at
      : Date.now() + room.secondsPerQuestion * 1000;
    room.circuitSimulatePaused = runtime.is_paused === 1;
    room.circuitSimulateRemainingMs = room.circuitSimulatePaused && Number.isFinite(runtime.remaining_ms)
      ? Math.max(0, Math.trunc(runtime.remaining_ms))
      : 0;

    const validChallengeIds = new Set(room.circuitSimulateChallenges.map((challenge) => challenge.id));
    const rows = db.prepare(`
      SELECT student_id, display_name, score, circuit_json, circuit_challenge_id, simulation_state,
             measurements_json, completed_challenges_json, last_activity_at, submission_attempts,
             last_submission_at, last_validation_code, last_validation_feedback,
             total_submission_attempts, incorrect_submission_attempts
      FROM game_circuit_player_states
      WHERE game_session_id = ?
      ORDER BY updated_at, student_id
    `).all(room.sessionId) as unknown as CircuitPlayerStateRow[];

    room.players = new Map();
    room.circuitSimulatePlayers = new Map();
    for (const row of rows) {
      const circuitResult = zCircuitDraw.safeParse(parsePersistedJson(row.circuit_json, null));
      const measurementsResult = zMeasurements.safeParse(parsePersistedJson(row.measurements_json, {}));
      const completedResult = zCompletedChallenges.safeParse(parsePersistedJson(row.completed_challenges_json, []));
      const completedChallenges = completedResult.success
        ? completedResult.data.filter((challengeId) => validChallengeIds.has(challengeId))
        : [];
      const player: CircuitSimulatePlayer = {
        userId: row.student_id,
        displayName: row.display_name,
        score: Number.isFinite(row.score) ? row.score : 0,
        circuit: circuitResult.success ? circuitResult.data : null,
        circuitChallengeId: row.circuit_challenge_id && validChallengeIds.has(row.circuit_challenge_id)
          ? row.circuit_challenge_id
          : null,
        simulationState: row.simulation_state,
        measurements: measurementsResult.success ? measurementsResult.data : {},
        completedChallenges,
        lastActivityAt: Number.isFinite(row.last_activity_at) && row.last_activity_at > 0
          ? row.last_activity_at
          : Date.now(),
        submissionAttempts: Number.isFinite(row.submission_attempts) && row.submission_attempts > 0
          ? Math.trunc(row.submission_attempts)
          : 0,
        lastSubmissionAt: row.last_submission_at !== null && Number.isFinite(row.last_submission_at)
          ? Math.max(0, Math.trunc(row.last_submission_at))
          : null,
        lastValidationCode: row.last_validation_code,
        lastValidationFeedback: row.last_validation_feedback,
        totalSubmissionAttempts: Number.isFinite(row.total_submission_attempts) && row.total_submission_attempts > 0
          ? Math.trunc(row.total_submission_attempts)
          : 0,
        incorrectSubmissionAttempts: Number.isFinite(row.incorrect_submission_attempts) && row.incorrect_submission_attempts > 0
          ? Math.trunc(row.incorrect_submission_attempts)
          : 0,
      };
      room.circuitSimulatePlayers.set(player.userId, player);
      room.players.set(player.userId, {
        userId: player.userId,
        displayName: player.displayName,
        score: completedChallenges.length * room.pointsPerCorrect,
        answers: new Map(),
        online: false,
      });
    }

    const currentChallenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
    if (currentChallenge) {
      const resetAt = Date.now();
      for (const player of room.circuitSimulatePlayers.values()) {
        if (player.circuitChallengeId === currentChallenge.id) continue;
        player.circuit = null;
        player.circuitChallengeId = currentChallenge.id;
        player.measurements = {};
        player.simulationState = 'idle';
        player.lastActivityAt = resetAt;
        player.submissionAttempts = 0;
        player.lastSubmissionAt = null;
        player.lastValidationCode = null;
        player.lastValidationFeedback = null;
      }
    }
    if (room.circuitSimulatePaused) clearTimer(room);
    else scheduleTimer(room);
    return true;
  };

  return { restoreCircuitSimulateRoom };
}
