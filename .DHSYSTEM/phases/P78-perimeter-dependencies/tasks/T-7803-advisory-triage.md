# T-7803 â€” Remaining Production Advisory Triage

## Objective

Patch or document the remaining `ip-address` and `exceljs/uuid` production advisory chains without unsafe blind downgrades.

## Paths

- `package.json`
- `server/package.json`
- `web/package.json`
- `package-lock.json`
- `docs/adr/dependency-security-v0.11.md`
- `scripts/e2e-excel-regression.mjs`
- `scripts/spreadsheet-formula-injection-test.mjs`

## File-Level Plan

1. Upgrade `express-rate-limit`/transitives to a patched `ip-address` chain and rerun client-IP tests.
2. Trace the affected UUID APIs through ExcelJS usage and prefer a patched upstream release.
3. If no patch is available, record reachability, compensating controls, owner and review date rather than applying npm's ExcelJS downgrade suggestion automatically.

## Verification Contract

- Every remaining moderate production advisory has upgrade evidence or an approved time-bounded risk record.
- Spreadsheet import/export and formula-injection regressions pass.

## Status

- `todo`
