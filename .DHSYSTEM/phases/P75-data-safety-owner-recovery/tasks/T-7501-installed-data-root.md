# T-7501 â€” Installed Data Root and Legacy Migration

## Objective

Make every bundled launch use the per-user SmartLecture data root and migrate legacy in-program data without loss.

## Paths

- `scripts/start-smartlecture.ps1` — always pass the resolved development/bundled data root.
- `installer/start-smartlecture-installed.ps1` — prepare and migrate the installed data root before server startup.
- `installer/prepare-smartlecture-data.ps1` — isolate backup-first migration and collision handling for direct testing.
- `scripts/build-windows-installer.ps1` — stage the migration helper beside the installed launcher.
- `installer/SmartLecture.iss` — keep runtime data outside `{app}` across upgrade and uninstall.
- `scripts/installed-data-migration-test.ps1` — cover empty, legacy, retry, collision and interrupted-copy cases.
- `package.json` — expose the focused migration regression command.
- `docs/HUONG-DAN-CAI-DAT.md` — document the real data path, legacy migration and collision recovery.
- `.DHSYSTEM/ARCHITECTURE.md` — record the installed data-root invariant.

## File-Level Plan

1. Export the resolved runtime directory to `DATA_DIR` for every child launch, including the default bundled path.
2. Detect legacy in-program data only while the server is stopped; inventory DB/WAL/SHM, media, backups, drop, logs and secret key.
3. Copy to a target-local staging directory, compare SHA-256 manifests, write a completion marker and publish the directory atomically. Preserve the legacy source as the rollback copy.
4. Treat an existing completed marker as an idempotent retry; if both roots contain data without a trusted marker, stop with recovery instructions instead of merging silently.
5. Keep repo-local development behavior and explicit `-DataDir` override compatible, package the helper, and document migration recovery.

## Verification Contract

- Focused PowerShell regression for empty, legacy, retry, collision and interrupted-copy cases.
- Typecheck, lint, production build and release-baseline checks remain green.
- Installer staging contains the helper; uninstall configuration never targets `%LOCALAPPDATA%\SmartLecture\data`.

## Status

- `in_progress`
