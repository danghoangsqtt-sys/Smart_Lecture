# T-5301 — Restore Active Circuit Host Console

## Objective

Make host recovery deterministic: reopening `/games` must recover the active session, attach the teacher socket safely, and reconstruct the current circuit challenge, completion activity, players, and circuit-score leaderboard.

## Expected Outcome

The teacher can reload or reconnect during a live circuit activity and immediately continue monitoring the same room. Three learners keep working without reconnecting, and no KTTX award is duplicated.

## Paths

- `server/src/realtime/gameRoom.ts`
- `web/src/pages/GamesPage.tsx`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/phases/P53-circuit-host-recovery/SPEC.md`
- `.DHSYSTEM/phases/P53-circuit-host-recovery/PHASE-STATE.md`
- `.DHSYSTEM/phases/P53-circuit-host-recovery/SUMMARY.md`
- `.DHSYSTEM/phases/P53-circuit-host-recovery/tasks/T-5301-restore-circuit-host-console.md`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/ARCHITECTURE.md`
- `CHANGELOG.md`

## File-Level Plan

- `server/src/realtime/gameRoom.ts`: derive circuit rankings from circuit-player scores; build a safe host snapshot containing only public challenge fields and reconstructed completion rows; include it in authorized `host:sync` responses.
- `web/src/pages/GamesPage.tsx`: recover the newest active standalone session through the existing authenticated API; register socket listeners before attach; normalize realtime circuit phase to the host `sandbox` view; restore challenge, feed, and leaderboard; show the circuit leaderboard during play.
- `tests/browser/login.spec.ts`: isolate teacher and each learner in separate browser contexts, reload the teacher page while all three learners remain active, and assert restored host state plus unchanged learner topology and grading.
- `.DHSYSTEM/ARCHITECTURE.md`: document the authorized host-attach/recovery contract and public circuit snapshot fields.
- DHSYSTEM and changelog files: record scope, evidence, result, next milestone, and durable completion state.

## Best-Practice Checklist

- Keep server authority and existing host authorization checks unchanged.
- Never expose reference circuits or answer topology in the host recovery payload.
- Use public, typed snapshot fields and deterministic reconstruction.
- Register response listeners before emitting a request that may respond synchronously.
- Preserve cleanup for sockets, timers, and browser contexts.
- Avoid restoring unrelated active sessions inside a class-locked Teaching Mode embed.
- Keep recovery errors non-blocking so normal game creation remains available.

## Verification Contract

- `npm run typecheck` → both workspaces pass with strict TypeScript.
- `npm run test:browser` → all browser workflows pass, including host full-page reload with three active learners.
- `npx -y react-doctor@latest . --verbose --scope changed` → no React errors and score remains 100/100.
- `npm run test:e2e` → REST, Socket.IO, security/data regression, Excel, and restore checks pass.
- Git persistence → clean worktree, upstream configured, and zero commits ahead after push.

## Status

- `completed`

## Verification Result

- Strict typecheck passed for server and web.
- Production build and Browser E2E passed 4/4; the circuit workflow kept three isolated learners active through a full host-page reload and completed the D Flip-Flop/Half Adder/Full Adder sequence.
- React Doctor changed scope passed 100/100 with no findings.
- Backend E2E passed REST 86/86, Socket.IO 10/10, security/data regression 22/22, Excel routes, and restore restart.
