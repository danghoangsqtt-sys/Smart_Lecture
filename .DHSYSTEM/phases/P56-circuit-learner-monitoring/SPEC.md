# P56 — Circuit Learner Monitoring Specification

## Goal

Give the authorized teacher a realtime per-learner circuit progress matrix and an on-demand, read-only view of a learner's current topology without pausing, resetting, or otherwise interrupting the active challenge.

## Privacy and Performance Model

- Learner topology updates are delivered only to a host-specific Socket.IO room; they are never broadcast to peer learners.
- `host:sync` includes compact progress metadata for every circuit learner but not all full topologies.
- The full current topology is returned only after an authorized host requests one learner by ID.
- While that learner remains selected, host-only topology updates keep the preview current.

## Acceptance Criteria

- The host sees one stable progress row per learner with online state, current status, completed challenge count, circuit score, simulation state, and component/wire counts.
- Status distinguishes not started, working, completed, and disconnected learners.
- Progress updates after join/reconnect, topology edit, simulation action, completion, challenge reset/transition, and disconnect.
- Selecting a learner opens a read-only circuit preview without changing challenge state or timer.
- Host reload and server restart reconstruct the progress matrix and inspection data from authoritative room/player persistence.
- Student or non-host sockets cannot request topology inspection or receive peer topology updates.
- Existing challenge controls, completion/KTTX idempotency, and three-learner flow remain unchanged.

## Realtime Contract

- Client → server: `circuit_simulate:inspect` with `{ userId }`, accepted only from the attached room host.
- Server → host: `circuit_simulate:progress` with one compact learner row.
- Server → host: `circuit_simulate:progress_snapshot` with all compact rows after challenge-wide transitions.
- Server → requesting host: `circuit_simulate:inspection` with current topology and public learner state.
- Server → host room: `circuit_simulate:inspection_update` after a learner topology change.

## Out of Scope

- Teacher editing or submitting a learner's circuit.
- Persisting which learner the teacher selected in the browser.
- Video/screen streaming from learner devices.
- Monitoring non-circuit game engines.
