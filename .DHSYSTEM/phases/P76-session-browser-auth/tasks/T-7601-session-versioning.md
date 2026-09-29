# T-7601 â€” Versioned REST and Socket Sessions

## Objective

Invalidate stale authentication after password, recovery and account-status changes.

## Paths

- `server/src/db/schema.sql` — add the stable session-version default for new databases.
- `server/src/db/connection.ts` — guard the v25 upgrade and expose the version on user rows.
- `server/src/routes/auth.routes.ts` — sign versioned claims and rotate the version on lock/password change.
- `server/src/routes/users.routes.ts` — revoke sessions on reset, lock and unlock.
- `server/src/middleware/auth.ts` — reject stale REST and flexible-media tokens.
- `server/src/realtime/socketAuth.ts` — reject stale Socket.IO handshakes.
- `server/src/cli/recoverAdmin.ts` — advance the recovered account version in the offline transaction.
- `web/src/components/Layout.tsx` — replace the current token after a successful self-service password change.
- `scripts/auth-session-revocation-test.mjs` — exercise pre-v25 upgrade plus REST/Socket stale/current claims.
- `.DHSYSTEM/ARCHITECTURE.md` — document the session claim and revocation invariant.

## Best Practices

- Keep authorization fail-closed and compare integer claims with the current SQLite row on every handshake/request.
- Increment versions in the same SQL mutation that changes credentials or account status.
- Never expose `session_version` in `PublicUser`; it is an internal security counter.

## File-Level Plan

1. Add a guarded migration for `users.session_version` with a stable default.
2. Include the version in signed claims and compare it with the current user on every REST/Socket authentication.
3. Increment the version atomically on password change/reset/recovery and security-sensitive lock transitions.
4. Define whether the successful current change flow receives a fresh token or requires login; apply one rule consistently.
5. Cover previously connected sockets and reconnects with stale tokens.

## Verification Contract

- REST and Socket tests prove stale tokens fail and current tokens continue to work.
- Upgrade from a pre-version database succeeds.

## Status

- `in_progress`
