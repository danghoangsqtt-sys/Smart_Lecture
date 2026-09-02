# P62 SPEC — Circuit Learning Debrief

## Problem

The circuit room ends on a generic leaderboard. Teachers cannot see how much of the challenge sequence the class completed or how many submitted attempts required correction, and the current-challenge attempt counter is reset whenever the room advances.

## Scope

Add a safe, durable learning debrief for `circuit_simulate`:

- persist cumulative submitted and incorrect attempt counters per learner;
- calculate one authoritative class summary and learner rows when the game finishes;
- emit the debrief on the private host channel immediately before the common `game:finished` event;
- persist each learner's debrief detail in `game_results.detail_json`;
- render a circuit-specific final view without exposing learner topology or reference circuits.

## Counter Contract

- Only an explicit learner submission increments the cumulative submitted-attempt counter.
- An explicit submission rejected by the authoritative validator also increments the cumulative incorrect-attempt counter.
- Live topology synchronization, host evaluation, timer expiry, challenge restart, and challenge transition do not increment either cumulative counter.
- Current-challenge diagnostics continue to reset as defined in P60; cumulative counters do not reset.

## Debrief Contract

Each learner row contains only:

- learner identity and display name;
- completed challenge count and total challenge count;
- cumulative submitted and incorrect attempts;
- final circuit score.

The class summary contains learner count, learners completing all challenges, total completions versus possible completions, submitted/incorrect attempts, and completion rate. It contains no topology, reference circuit, validation feedback, or assistance message.

## Persistence Rules

- Migration v24 adds non-negative cumulative counters to `game_circuit_player_states`.
- Room restart restores both counters.
- `finishGame` writes the learner debrief object to `game_results.detail_json` in the same result transaction and updates it on conflict.
- Non-circuit game result details remain `{}`.

## Non-goals

- Reloading or reopening a finished room.
- Historical analytics screens across multiple sessions.
- AI-generated remediation recommendations.
- Changing scoring, KTTX, challenge content, pacing, or validation rules.

## Acceptance Criteria

1. Cumulative submitted/incorrect counters survive challenge transitions and a Node.js restart.
2. Explicit incorrect then correct submissions produce accurate counters without duplicate score or KTTX.
3. Finishing the final challenge emits and renders the authoritative class/learner debrief.
4. `game_results.detail_json` stores only the safe per-learner debrief and is updated idempotently.
5. Browser and restart integration cover the lifecycle while all existing regressions remain green.
