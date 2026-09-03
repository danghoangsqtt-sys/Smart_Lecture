# T-6901 — Class Detail Workspace Modularization

## Objective

Split the class-detail route into focused class-domain modules while preserving the existing teacher/admin classroom workflows exactly.

## Paths

- `web/src/pages/ClassDetailPage.tsx`
- `web/src/features/class-detail/*`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P69-class-detail-workspace-modularization/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Identify types and helpers used across class-detail tabs and place them in a small typed feature contract module.
- Extract overview, student/enrollment, attendance, gradebook, groups, settings, curriculum, and teaching-workspace boundaries without changing their requests or rendered contracts.
- Keep the page entry limited to route identity, URL-tab selection, initial class loading, permission derivation, and feature composition.
- Preserve `CurriculumTab` and `TeachingModeTab` exports through a compatibility entry or update every internal caller deliberately.
- Add a Browser flow for direct class-detail access/tab switching and retain the full established regression gates.

## Verification Contract

- `npm run typecheck` and `npm run build`.
- `npx react-doctor` changed-scope scan with no new confirmed finding.
- `npm run test:browser` and `npm run test:e2e`.
- `git diff --check`.

## Status

- `completed`

## Verification

- `npm.cmd run typecheck`: PASS.
- `npm.cmd run build`: PASS.
- `npm.cmd run test:browser`: PASS, 4/4.
- `npm.cmd run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/export checks PASS.
- `git diff --check`: PASS.
