# REQ-20260929-001 â€” Local owner password recovery

- Type: ENH
- Priority: medium
- Status: completed
- Implemented by: P75 / T-7502
- Audit tier: 3
- Detected: 2026-09-29

## Gap

SmartLecture has authenticated password change and staff-driven password reset, but the only administrator cannot recover access after forgetting the password. An email reset flow does not fit the local-first/LAN deployment because accounts do not have verified recovery addresses.

## Evidence

- `server/src/routes/auth.routes.ts`: `/change-password` requires a valid bearer token and the old password.
- `server/src/routes/users.routes.ts`: `/users/:id/reset-password` requires an authenticated admin/teacher.
- The installed runtime database inspected during this audit has one active admin whose password is no longer the documented initial password.

## Recommended outcome

Add an offline owner-only recovery command that operates on an explicitly selected data directory while the server is stopped. It should create a one-time temporary password, set `must_change_password = 1`, clear failed attempts, invalidate existing sessions, make a recoverable database backup, and never expose a reset endpoint to unauthenticated LAN clients.

## Acceptance criteria

- Recovery requires local filesystem/console access and refuses to run while the database is active.
- The target data directory and admin username are displayed and confirmed before mutation.
- Existing sessions are invalid after recovery.
- The temporary password is single-use through the existing forced-change flow.
- Automated tests cover repo, installed, locked-admin, and multiple-admin cases.
