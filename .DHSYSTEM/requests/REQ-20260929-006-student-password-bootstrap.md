# REQ-20260929-006 â€” Harden imported student passwords

- Type: BUG
- Priority: high
- Status: completed
- Planned phase: P77 / T-7701
- Audit tier: 3
- Detected: 2026-09-29

## Gap

Imported student accounts may receive a shared default password or their username as the password, while `insertUser` marks students as not requiring a password change. These credentials are predictable to other users on the same LAN.

## Evidence

- `server/src/routes/users.routes.ts`: blank import passwords default to `Hocvien@123`.
- `server/src/routes/classes.routes.ts:785`: blank spreadsheet passwords default to the username.
- `server/src/routes/users.routes.ts:80`: `must_change_password` is set to `0` for every student.

## Acceptance criteria

- Generate per-user cryptographically random temporary passwords or require an explicit secure import policy.
- Set `must_change_password = 1` for all temporary credentials, including students.
- Avoid returning or logging plaintext passwords after the one necessary handoff.
- Add tests for blank-password imports and first-login enforcement.

## Resolution

- Completed in P77 / T-7701 with crypto-random per-account defaults, one-time no-store handoff, duplicate preservation and mandatory first replacement.
- Verified by focused credential regression 11/11 and Browser first-login/media flows 3/3.
