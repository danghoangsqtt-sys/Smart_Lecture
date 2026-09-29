# REQ-20260929-012 â€” Triage remaining production dependency advisories

- Type: ENH
- Priority: medium
- Status: planned
- Planned phase: P78 / T-7803
- Audit tier: 3
- Detected: 2026-09-29

## Gap

After separating the high-severity Multer issue, `npm audit --omit=dev` still reports moderate advisories through `exceljs -> uuid@8.3.2` and `express-rate-limit -> ip-address@10.5.0`.

## Recommended outcome

- Upgrade `express-rate-limit`/lockfile to a dependency chain containing a patched `ip-address` release and rerun rate-limit tests.
- Determine whether SmartLecture exercises the affected UUID buffer APIs through ExcelJS; document exploitability and upstream status instead of applying the audit suggestion to downgrade ExcelJS blindly.
- Keep the server and browser ExcelJS usage covered by spreadsheet formula-injection and export regressions.

## Acceptance criteria

- Each moderate advisory has a patched upgrade or a documented, evidence-backed risk acceptance with review date.
- `npm audit --omit=dev` output is captured in the release quality gate.
