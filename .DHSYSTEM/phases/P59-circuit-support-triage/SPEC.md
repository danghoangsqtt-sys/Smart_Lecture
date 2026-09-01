# P59 — Circuit Support Triage Specification

## Goal

Help a teacher triage up to 60 circuit learners quickly by prioritizing inactivity and unacknowledged assistance without changing server state.

## Priority Semantics

1. Online working learner inactive for at least 10 seconds.
2. Assistance queued for an offline learner.
3. Assistance delivered but not yet acknowledged.
4. Disconnected learner without queued assistance.
5. Other working, not-started, and completed learners.

Acknowledged assistance is not considered pending attention. Ordering is derived from authoritative progress and P58 checkpoint status, then uses the oldest activity first and learner name as the deterministic tie-breaker.

## Acceptance Criteria

- Host sees counts for all learners, learners needing attention, pending acknowledgement, and offline learners.
- Filters show All, Cần xử lý, Chờ xác nhận, and Ngoại tuyến subsets without requesting additional topology.
- A “Học viên cần hỗ trợ tiếp theo” action selects the highest-priority learner.
- Rows expose assistance state alongside circuit activity state.
- Realtime progress/assistance updates immediately recompute filters and ordering.
- Browser E2E covers stuck prioritization, queued/delivered/acknowledged transitions, filtering, and next-learner navigation.
- Existing privacy, restart recovery, topology, timer, and grading behavior remain unchanged.

## Out of Scope

- Server-side assignment of support cases.
- Persisted teacher filter preferences.
- Full assistance history or AI-generated hints.
