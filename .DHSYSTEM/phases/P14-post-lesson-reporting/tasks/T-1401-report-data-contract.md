# T-1401 — Report data contract and authorization

## Objective

Expose a stable post-lesson report based only on confirmed teaching telemetry: teaching logs, attendance linkage, curriculum progress, game sessions and recorded KTTX references. Every result must be scoped to the requested class and optional subject.

## Paths

- `server/src/routes/teachingLogs.routes.ts` — report aggregation endpoint.
- `server/src/routes/classes.routes.ts` — reuse only existing scoped class/grade queries when needed.
- `web/src/pages/TeachingHubPage.tsx` — consumer contract after API is proven.
- `scripts/e2e-regressions.mjs` — authorization and aggregation regression.

## File-Level Plan

1. Inventory existing teaching-summary endpoint and distinguish reusable totals from report-specific fields. ✅
2. Define report semantics: up to 200 most-recent persisted sessions, session count, curriculum progress, attendance linkage, activities and explicit data gaps. ✅
3. Add strict class/subject authorization and tests for teacher/student/cross-class access. ✅
4. Verify aggregation against seeded session data before adding export/UI. ✅

## Acceptance Criteria

- No cross-class or cross-subject data is exposed.
- Missing attendance/game/grade data is reported as missing, never interpreted as failure.
- Existing teaching-session E2E remains green.

## Execution Log

- 2026-08-28: started after P13 completion. Existing teaching log summary and post-lesson insights are being inventoried before API changes.
- 2026-08-28: completed. Added `GET /classes/:classId/teaching-logs/report`; its `report`, `summary`, `dataQuality` and `sessions` fields are source-log based. Missing telemetry is explicitly counted and never interpreted as an academic or attendance outcome. Regression: teacher 200 with session/game evidence; student 403; foreign subject filter 400.
