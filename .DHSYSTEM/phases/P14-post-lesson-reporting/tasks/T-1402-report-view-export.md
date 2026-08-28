# T-1402 — Teacher report view and export

## Objective

Give the teacher a post-lesson report that remains understandable during normal teaching operations: transparent data-quality indicators, a subject filter and authenticated XLSX/CSV export.

## Acceptance Criteria

- The Teaching Hub identifies data that has not been recorded without calling it absent, failed or incomplete learning.
- The active class/subject filter is preserved for both report view and export.
- Export is authenticated and downloads only the class/subject currently in scope.

## Execution Log

- 2026-08-28: planned after T-1401 contract inventory.
- 2026-08-28: completed. Teaching Hub exposes the transparent missing-data indicator and authenticated XLSX/CSV exports. Export now labels subject and curriculum fields with names rather than opaque IDs. Browser E2E verifies the XLSX download under a teacher session.
