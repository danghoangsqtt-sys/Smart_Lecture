# P60 SPEC — Circuit Submission Diagnostics

## Problem

P59 tells the teacher which learner needs attention, but not whether that learner recently submitted an incorrect circuit or why it failed. Learners receive incorrect-submission feedback only as a transient toast, so they cannot reliably revisit it while correcting the circuit.

## Scope

Persist the current challenge's submission count and latest validation checkpoint per learner. Expose only safe diagnostic metadata to the authorized host progress/inspection channel, keep the feedback visible for the learner, and add incorrect submissions to classroom triage.

## Validation Checkpoint

Each submitted circuit records:

- current-challenge attempt count;
- submission epoch;
- result code: `correct`, `invalid_data`, `wire_count`, `component_count`, or `connection`;
- Vietnamese feedback that identifies the category without exposing the reference topology.

The checkpoint resets when the room moves to or explicitly restarts a challenge. Ordinary circuit edits do not create attempts. Repeated correct submissions remain protected by the existing idempotent completion/KTTX contract.

## Teacher Experience

- An incorrect latest submission is an attention state and appears before inactivity-only learners.
- The monitor shows an `Nộp chưa đạt` count/filter and an attempt badge on the learner row.
- Inspection shows attempt count, relative submission time, and the same safe diagnostic reason.
- Diagnostics remain host-only and recover through host reload and Node.js restart.

## Learner Experience

- The latest submission result is rendered as a persistent accessible status panel instead of toast-only feedback.
- The panel updates after every explicit submission and resets on the next/restarted challenge.
- A successful result remains compatible with the existing completion notification.

## Non-goals

- No reference-circuit/topology disclosure to learners or peer sockets.
- No full attempt history or analytics warehouse.
- No AI-generated feedback.
- No change to scoring, challenge timer, assistance acknowledgement, or KTTX rules.

## Acceptance Criteria

1. Migration v23 upgrades existing databases and fresh schema contains the diagnostic columns with safe defaults/checks.
2. Only `submitted=true` increments attempts and records a validation checkpoint.
3. Host progress, inspection, reload, and process restart restore the current diagnostic without topology broadcast.
4. Teacher can count/filter incorrect latest submissions and see the reason for the inspected learner.
5. Learner sees durable validation feedback and can correct then submit successfully.
6. Existing privacy, assistance, grading, timer, restore, and idempotency regressions remain green.
