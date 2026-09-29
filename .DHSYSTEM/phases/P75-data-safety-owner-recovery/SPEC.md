# Phase 73 â€” Installed Data Safety & Owner Recovery

## Goal

Put installed runtime data in the durable per-user data directory and give the physical machine owner a safe way to recover the only administrator without exposing an unauthenticated LAN reset endpoint.

## Design contract

- Bundled installs always use `%LOCALAPPDATA%\SmartLecture\data`; source checkouts retain repo-local `data/` unless overridden.
- Legacy `app/data` migration is offline, backup-first, idempotent and never overwrites a non-empty destination silently.
- Recovery requires local process/filesystem access, an explicitly resolved data directory and a stopped SmartLecture server.
- Recovery updates one selected admin, clears lock counters, forces immediate password change and revokes existing sessions.
- Password hashes remain one-way; no workflow attempts to reveal an existing password.

## Non-goals

- Email/SMS recovery, security questions, cloud identity or an unauthenticated HTTP reset endpoint.
- Moving teacher media between different machines automatically.

## Quality gate

- Upgrade tests cover legacy DB+WAL state, existing destination, interrupted migration and rollback.
- Recovery tests cover active/locked admin, multiple admins, wrong data directory and running-server refusal.
