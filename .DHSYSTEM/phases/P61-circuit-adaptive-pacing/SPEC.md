# P61 SPEC — Circuit Adaptive Pacing

## Problem

The teacher can pause, resume, skip, or restart a circuit challenge, but cannot extend time when the P59/P60 support view shows that learners are close to completing. The teacher also cannot evaluate the current topology and advance immediately when the class is ready, forcing the lesson to wait for the original deadline.

## Scope

Add an authoritative classroom-readiness summary and two host-only pacing actions:

- `extend`: add 30 seconds to the running deadline or paused remaining duration;
- `evaluate`: evaluate all current learner circuits immediately, apply existing idempotent completion/KTTX rules, and advance exactly like timer expiry.

## Readiness Contract

The host derives readiness from private progress already available in P56–P60:

- completed learners / online learners;
- learners who have submitted at least once;
- learners whose latest submission is incorrect.

No learner topology is loaded or broadcast to calculate the summary.

## Timer Rules

- The server is the only source of truth.
- Each extend action adds exactly 30,000 ms.
- Remaining time is capped at 10 minutes to prevent accidental unbounded extension.
- While running, extend updates the absolute deadline, persists it, reschedules the timer, and broadcasts control state.
- While paused, extend updates/persists `remaining_ms` without starting a timer.
- Reload and Node.js restart restore the extended value through the existing runtime checkpoint.

## Evaluate Rules

- Only the authenticated room host can invoke evaluation.
- Evaluation reuses `evaluateCircuitSimulateChallenge`; it does not introduce a second grading path.
- Correct topology is awarded once; incorrect/empty topology is not awarded.
- The current timer is cleared before evaluation and the room advances once.

## Non-goals

- No automatic AI pacing recommendation.
- No learner-controlled time extension.
- No per-learner deadline.
- No change to scoring, challenge definitions, diagnostics, or assistance checkpoints.

## Acceptance Criteria

1. Host sees completed/online readiness plus attempted and incorrect counts.
2. `+30 giây` updates running and paused authoritative time and survives restart.
3. `Chấm ngay & chuyển bài` evaluates once and advances without duplicate KTTX.
4. Student/peer sockets cannot invoke either pacing action.
5. Browser and restart integration cover the new actions while all existing regressions remain green.
