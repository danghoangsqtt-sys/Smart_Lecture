# P63 SPEC — Circuit Debrief Recovery

## Problem

P62 persists safe learner details, but the host can only see the class debrief on the live finish screen. Reloading the Games page clears the finished session from active recovery, leaving durable data inaccessible from the teaching UI.

## Scope

- Reconstruct a circuit learning debrief from validated `game_results.detail_json` rows.
- Add a host-authorized endpoint for one finished circuit session.
- Add a host-scoped recent circuit debrief list with optional authorized class filtering.
- Show recent summaries on the Games page and let the teacher expand learner details after reload.
- Keep finished rooms out of the active realtime recovery path.

## Retrieval Contract

- Only the original host or an administrator can retrieve one session's debrief.
- The `mine/recent` feed is restricted to teacher/admin roles and the authenticated user's own hosted sessions.
- An optional `classId` filter must pass the existing class-management authorization check.
- Only `circuit_simulate` sessions with `status=finished` are eligible.
- Result detail must match the P62 versioned schema; malformed, legacy, or unrelated rows are ignored.
- If no valid P62 learner detail remains, the single-session endpoint returns a clear unavailable error and the recent feed omits the session.

## UI Contract

- Recent reports do not reopen or attach to a finished Socket room.
- The compact list shows title, finish time, learner count, completion rate, and submitted/incorrect totals.
- Expanding a report uses the same debrief view as the live finish screen.
- In Teaching Mode, recent reports are filtered to the locked class.

## Non-goals

- Editing or deleting historical results.
- Cross-session trends or AI recommendations.
- CSV/XLSX export.
- Replaying a finished room.

## Acceptance Criteria

1. Host can retrieve a finished P62 circuit debrief after page reload from SQLite only.
2. Student and unrelated teacher access are rejected; class filters cannot bypass management scope.
3. Corrupt or legacy detail rows never crash or leak raw JSON.
4. Games page shows and expands recent reports, including after the live finish page is reloaded.
5. Browser and backend integration pass without changing active-room recovery or learner privacy.
