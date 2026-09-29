# REQ-20260929-002 â€” Revoke sessions after password or account changes

- Type: BUG
- Priority: high
- Status: planned
- Planned phase: P76 / T-7601
- Audit tier: 3
- Detected: 2026-09-29

## Gap

JWTs contain only the user ID and remain valid for up to 12 hours after a password change or staff reset. Locking an account is checked on each request, but changing/resetting a password does not invalidate a token that may already be compromised.

## Evidence

- `server/src/routes/auth.routes.ts`: tokens are signed with `{ sub: row.id }`; password change only updates the hash.
- `server/src/routes/users.routes.ts`: reset only updates the hash, counters, and forced-change flag.
- `server/src/middleware/auth.ts` and `server/src/realtime/socketAuth.ts`: no password/session version is compared.

## Acceptance criteria

- Add a session/password version or password-changed timestamp to the user record and JWT.
- Reject stale REST and Socket.IO tokens after change, reset, recovery, lock, or unlock as appropriate.
- Clear the client token after successful password change and require a fresh login, or issue a newly versioned token explicitly.
- Add REST and socket regression coverage.
