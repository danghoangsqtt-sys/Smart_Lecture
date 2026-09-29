# T-7601 â€” Versioned REST and Socket Sessions

## Objective

Invalidate stale authentication after password, recovery and account-status changes.

## Paths

- `server/src/db/schema.sql`
- `server/src/db/connection.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/routes/users.routes.ts`
- `server/src/middleware/auth.ts`
- `server/src/realtime/socketAuth.ts`
- `server/src/cli/recoverAdmin.ts`
- `scripts/auth-session-revocation-test.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`

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

- `todo`
