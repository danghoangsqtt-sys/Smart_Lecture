# Phase 72 — Windows installer distribution

## Goal

Produce one self-contained `SmartLecture-Setup-<version>.exe` that a teacher can install without Git, Node.js, a terminal, or repository access.

## Distribution design

- Inno Setup installs per user under `%LOCALAPPDATA%\Programs\SmartLecture`; administrator permission is not required.
- The installer includes the production web/server builds, a bundled `node.exe`, runtime dependencies, a launcher, Desktop/Start Menu shortcuts, and the Vietnamese installation guide.
- Teacher data, logs, database, media, secret key, and backups live under `%LOCALAPPDATA%\SmartLecture\data`, outside the application folder. Uninstall removes the program but deliberately keeps this data.

## Non-goals

- The installer does not expose the Git repository or require GitHub access.
- It does not promise source-code secrecy against a determined reverse engineer; repository visibility and secret rotation remain separate controls.
- It does not use Electron.

## Quality gate

- Production build and static checks pass before staging.
- Staged copy starts with bundled Node on an isolated port and satisfies `/api/health`.
- Inno Setup compiles an executable in ignored `release/` output.
