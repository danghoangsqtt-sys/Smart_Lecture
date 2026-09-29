# T-7502 â€” Offline Owner Administrator Recovery

## Objective

Provide a local, backup-first recovery command for a forgotten sole-admin password.

## Paths

- `server/src/cli/recoverAdmin.ts`
- `scripts/recover-admin.ps1`
- `scripts/build-installer.ps1`
- `package.json`
- `server/src/db/connection.ts`
- `server/src/db/schema.sql`
- `docs/HUONG-DAN-CAI-DAT.md`
- `scripts/admin-recovery-test.mjs`

## File-Level Plan

1. Resolve an explicit/default installed data root and refuse ambiguous paths or a running server.
2. List only admin identity/status metadata; require an explicit target if multiple admins exist.
3. Back up the database, generate a cryptographically random one-time password, hash it with the application policy, clear lock counters, force password change and advance session version in one transaction.
4. Print the temporary password once without logging it to disk.
5. Ship a PowerShell wrapper and compiled CLI with the installer; document recovery and rollback.

## Verification Contract

- Tests cover active/locked/sole/multiple admin, wrong directory, server-running refusal and backup restore.
- No unauthenticated HTTP route is introduced.

## Status

- `todo`
