# P14 Specification — Post-lesson Reporting

## Scope

P14 turns persisted teaching telemetry into a teacher-only report. It does not create, alter or infer student grades, attendance outcomes or curriculum completion.

## API contract

`GET /api/classes/:classId/teaching-logs/report?subjectId=:subjectId`

- Access: class owner teacher or administrator only.
- `subjectId` is optional and must belong to `classId`; an invalid combination returns `400`.
- A student or another teacher without class-management permission receives `403`.
- The response contains `report` (generation time and scope), `summary`, `dataQuality` and the latest 200 persisted `sessions` in reverse chronological order.
- Each session preserves source references for attendance, displayed slides, played videos, resolved game title/id, recorded KTTX references and notes.

## Data-quality semantics

`sessionsWithoutAttendanceRecord`, `sessionsWithoutAttendanceLink` and `sessionsWithoutActivityTelemetry` are completeness indicators only. A non-zero value means a source log lacks that record; it must never be rendered or used as a conclusion about a learner, attendance or teaching quality.

## UI and export

The Teaching Hub uses the same class and optional subject scope for its visible summary and export controls. XLSX/CSV downloads call the authenticated log-export endpoint; exported rows display subject and curriculum names, plus raw source references needed for audit.

## Verification gate

- Typecheck and production build pass.
- Isolated REST regression proves scoped evidence, explicit data quality, student denial and invalid-subject rejection.
- Browser E2E proves an authenticated teacher can download the XLSX report.
