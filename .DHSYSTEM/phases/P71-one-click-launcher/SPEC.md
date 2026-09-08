# Phase 71 — Windows one-click launcher

## Goal

Make the local-first SmartLecture deployment convenient for teachers: a Desktop shortcut starts the production server when needed and opens the local application in the default browser.

## Scope

- Keep the existing Node.js + browser architecture; do not introduce Electron or a cloud service.
- Provide an idempotent PowerShell launcher, Desktop shortcut installer, and shortcut removal script.
- Reuse `/api/health` to distinguish SmartLecture from another process already using the requested port.

## Non-goals

- Do not build automatically during every launch, because Windows may hold production assets while the server is running.
- Do not terminate a process that owns the port.
- Do not alter application data, authentication, or LAN behaviour.

## Quality gate

- Production build, typecheck, and lint pass.
- Launcher starts the production server on an unused non-default test port and passes the existing healthcheck.
- Shortcut installer creates a `.lnk` that targets the launcher and is safe to run again.
