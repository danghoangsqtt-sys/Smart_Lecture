# T-7201 — Build distributable Windows installer

## Objective

Create an installable Windows release that contains everything required to run SmartLecture locally. A teacher must install one `.exe` and use the resulting Desktop icon; the release must not require the source repository, Node.js, Git, or a terminal.

## Paths

- `scripts/build-installer.ps1` — build production artifacts, stage runtime files, and invoke Inno Setup.
- `scripts/start-smartlecture.ps1` — prefer bundled Node and use a per-user data directory when running from an installed release.
- `installer/SmartLecture.iss` — Inno Setup metadata, files, shortcuts, and data-preserving uninstall policy.
- `docs/HUONG-DAN-CAI-DAT.md` — installation, first login, daily use, update, and recovery guide shipped to teachers.
- `package.json`, `README.md`, `.gitignore` — expose packaging command and exclude generated release artifacts.
- `.DHSYSTEM/phases/P72-windows-installer/*`, `.DHSYSTEM/TRACKER.md`, `.DHSYSTEM/ROADMAP.md`, `.DHSYSTEM/HANDOFF.json`, `CHANGELOG.md` — execution record and release state.

## File-Level Plan

1. Make the existing launcher use `node/node.exe` when present. In an installed release its default data root becomes `%LOCALAPPDATA%\SmartLecture\data`; in the source checkout it retains `data/`.
2. Stage only built server/web artifacts, bundled Node, runtime dependencies, launcher, and teacher guide into `release/staging/app`. The staging directory is regenerated for each package build and is ignored by Git.
3. Configure Inno Setup for a per-user install, Desktop/Start Menu shortcuts, a post-install launch option, and an uninstaller that retains data.
4. Add `npm run package:windows` so creating a release becomes one command on the developer machine.
5. Verify the staged release with bundled Node on an isolated port before compiling the final installer.

## Best Practices

- Never include `.env`, `data/`, Git metadata, test output, or source TypeScript/TSX files in the staged release.
- Use the existing `/api/health` contract and refuse to kill an unknown port owner.
- Keep release output reproducible from a clean build and do not modify runtime data during packaging.
- Mark the installer as unsigned in the guide; code signing is recommended before broad distribution.

## Verification

1. `npm run typecheck`, `npm run lint`, and `npm run build` pass.
2. `npm run package:windows` creates `release/SmartLecture-Setup-0.9.2.exe`.
3. Run the staged launcher with `-Port 4184 -DataDir <temporary path> -NoBrowser`, then the existing healthcheck; both pass.
4. Inspect the installer file and staging manifest; no `.git`, `data`, `.env`, source `src`, or `node_modules/.cache` is included.
5. `git diff --check` passes.

## Execution Log

- 2026-09-08: Task created after the owner approved delivery as one Windows installer rather than repository access.
- 2026-09-08: Installed Inno Setup 6.7.3 on the release workstation, added the staging/compiler pipeline and compiled `release/SmartLecture-Setup-0.9.2.exe`. Typecheck, lint, and production build passed. The staged package started through bundled Node 24.12.0 on port 4184, passed `/api/health`, and contained none of `.git`, `data`, `.env`, `server/src`, or `web/src`.

## Status

- `done`
