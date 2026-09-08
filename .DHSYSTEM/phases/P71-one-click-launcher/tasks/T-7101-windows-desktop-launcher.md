# T-7101 — Windows Desktop launcher

## Objective

Allow a teacher to open SmartLecture by double-clicking one Desktop icon. The launcher must start the already-built production server only when it is not healthy, wait for the existing health contract, and open `http://127.0.0.1:<port>` in the default browser.

## Paths

- `scripts/start-smartlecture.ps1` — add an idempotent, health-aware production launcher.
- `scripts/install-desktop-shortcut.ps1` — add a per-user Desktop shortcut installer.
- `scripts/uninstall-desktop-shortcut.ps1` — add exact shortcut removal.
- `package.json` — expose launcher and shortcut installation commands.
- `README.md` — document one-time installation and daily one-click usage.
- `CHANGELOG.md` — record the user-facing operating improvement.
- `.DHSYSTEM/phases/P71-one-click-launcher/*` — task evidence and completion state.
- `.DHSYSTEM/TRACKER.md`, `.DHSYSTEM/ROADMAP.md`, `.DHSYSTEM/HANDOFF.json` — record current task and handoff state.

## File-Level Plan

1. `start-smartlecture.ps1` checks that `server/dist/index.js` and `web/dist/index.html` exist; it then probes `/api/health`. If SmartLecture is healthy it only opens the browser. If no process owns the port it starts `node dist/index.js` in the background, writes output to ignored runtime logs, waits for the health contract, and opens the browser. If another process owns the port, it fails without stopping that process.
2. `install-desktop-shortcut.ps1` uses the current user's Desktop known folder and creates or replaces only `SmartLecture.lnk`. The shortcut runs the launcher through Windows PowerShell with a working directory set to the project root.
3. `uninstall-desktop-shortcut.ps1` removes only that exact per-user shortcut.
4. Package scripts and README make the one-time build/install step and daily icon behaviour discoverable.
5. The task log records the controlled test port, healthcheck result, and final Git state.

## Best Practices

- Use repo-relative paths resolved from `$PSScriptRoot`; do not depend on the caller's working directory.
- Never kill or reuse an unknown service bound to the selected port.
- Keep the launcher production-only and require a deliberate `npm run build` after updates.
- Use `Start-Process -WindowStyle Hidden` for the background server and the default browser shell for the user-visible page.
- Keep user-facing output in Vietnamese and code identifiers in English.

## Verification

1. `npm run typecheck` exits 0.
2. `npm run lint` exits 0.
3. `npm run build` exits 0.
4. Run `scripts/start-smartlecture.ps1 -Port 4181 -NoBrowser`, then `scripts/healthcheck.ps1 -Port 4181`; both succeed.
5. A second launcher run on port 4181 reports the healthy existing server rather than creating a second listener.
6. Install the Desktop shortcut and inspect its target/arguments; remove it only if the user requests removal.
7. `git diff --check` exits 0.

## Execution Log

- 2026-09-08: Created after the project owner explicitly approved one-click Windows launch. GitHub `main` was synchronized to `d260983` before implementation.
- 2026-09-08: Implemented the launcher, exact Desktop shortcut installer/remover, npm commands, README runbook and changelog. `npm run typecheck`, `npm run build`, and `git diff --check` passed. `npm run lint` exited 0 with two pre-existing React hook warnings outside this task. Isolated launcher smoke test on port 4182 passed for cold start, `/api/health`, and a second launch that reused the running server. The Desktop shortcut targets `scripts/start-smartlecture.ps1` through Windows PowerShell.

## Status

- `done`
