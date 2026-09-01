# P60 Summary — Circuit Submission Diagnostics

## Outcome

Circuit submissions now produce one durable validation checkpoint for the current challenge. A learner can keep the latest result visible while correcting the circuit, and the authorized teacher can identify and inspect incorrect submissions directly from the P59 support queue.

## Delivered

- Migration v23 and fresh-schema columns for attempts, submission epoch, validation code, and bounded safe feedback.
- Structured validation categories without reference-topology disclosure.
- Persistent accessible learner feedback restored on reconnect/process restart.
- Host-only incorrect-submission priority, count, filter, attempt badge, and inspection reason.
- Diagnostic reset on challenge advance/restart while completed score and KTTX remain idempotent.

## Architecture Boundary

P60 stores only the latest checkpoint for the active challenge, not a full attempt history. Ordinary topology synchronization never creates an attempt. Learners receive only their own validation event; peer learners receive neither diagnostics nor topology. The host receives diagnostic metadata through the existing private progress and inspection channels.

## Verification

- Typecheck and production build: PASS.
- React Doctor changed scope: 100/100.
- Browser E2E: 4/4 PASS, including incorrect → correct and repeated correct submission.
- REST E2E: 86/86 PASS.
- Socket realtime: 10/10 PASS.
- Security/data regression: 22/22 PASS.
- Restore and circuit process-restart diagnostic recovery: PASS.
