# T-8201 â€” Reconcile State and Release SmartLecture v0.11.0

## Objective

Close every planned request with consistent documentation and a reproducible v0.11.0 release gate.

## Paths

- `README.md`
- `CHANGELOG.md`
- `package.json`
- `server/package.json`
- `web/package.json`
- `package-lock.json`
- `.DHSYSTEM/PROJECT-META.md`
- `.DHSYSTEM/HANDOFF.json`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/architecture/*`
- `.DHSYSTEM/requests/*`

## File-Level Plan

1. Mark P75â€“P82 and their request records from verified execution evidence only.
2. Align package/runtime/docs versions and move completed v0.9/v0.11 changelog entries to dated releases.
3. Add the architecture applicability/source matrix and maintain required Mermaid sidecars.
4. Document historical phase/tag exceptions, installed data/recovery operations and the security model.
5. Run the complete release gate, build the Windows installer and rehearse upgrade/reinstall with preserved data.

## Verification Contract

- Consistency scan, typecheck, lint, build, production audit, focused suites, isolated E2E and Browser E2E pass.
- Packaged v0.11.0 uses the durable data root and new icon family.

## Status

- `todo`
