# REQ-20260929-003 â€” Keep installed runtime data outside the application directory

- Type: BUG
- Priority: high
- Status: completed
- Implemented by: P75 / T-7501
- Audit tier: 3
- Detected: 2026-09-29

## Gap

The Windows launcher computes `%LOCALAPPDATA%\SmartLecture\data` for bundled installs but only exports `DATA_DIR` when the caller explicitly passes `-DataDir`. A normal installed launch therefore falls back to `app\data`, contradicting release documentation and placing the database inside the application tree.

## Evidence

- `scripts/start-smartlecture.ps1:70-75` computes `$runtimeDir` for bundled Node.
- `scripts/start-smartlecture.ps1:86-88` sets `DATA_DIR` only under `if ($DataDir)`.
- The running installed copy inspected during this audit uses `E:\Programes\SmartLecture\app\data\smart-lecture.db`; the intended LocalAppData database is absent.

## Acceptance criteria

- Always export the resolved `$runtimeDir` to the child process.
- Add a safe, backup-first migration from legacy `app\data` to LocalAppData without overwriting an existing target.
- Preserve data through upgrade/uninstall and document the actual path.
- Installer/launcher smoke tests assert the server-reported database path or a durable sentinel record after reinstall.
