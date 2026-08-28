# Phase State — P12 Release hardening

- Phase: `in_progress`
- Version target: `0.9.0`
- Dependency: P11 completed
- Quality gate: release gates in `docs/SPEC.md` section 6.

## Tasks

| Task | Status | Dependency | Verification |
| --- | --- | --- | --- |
| T-1201 Baseline/version/docs | done | — | typecheck, clean build, documentation consistency scan |
| T-1202 Excel/dependency security | done | T-1201 | audit, ADR, XLSX route regression |
| T-1203 Windows lifecycle | planned | T-1201 | three clean build/start/stop cycles, healthcheck |
| T-1204 Browser quality gate | planned | T-1201 | isolated browser E2E in CI |

## T-1202 Result

- Removed SheetJS `xlsx` from both workspaces and the lockfile after the high-severity audit finding; ExcelJS is the single XLSX adapter.
- Added server-side scalar-safe spreadsheet utilities, deferred client-side ExcelJS loading for grade exports, and explicit `.xlsx`/`.csv` import support.
- Fixed curriculum template route precedence and Vietnamese header normalization discovered by route regression.
- Verified: `npm audit --omit=dev --audit-level=high` has no high/critical finding; typecheck; server build; clean web build; 86 REST + Excel route regression + 10 Socket + 16 regression + restore/restart.

## T-1201 Result

- Centralized the `0.9.0` runtime version and aligned system-info, backup manifest and the isolated E2E assertion.
- Verified: typecheck, version consistency scan, server build, clean web build, 86 REST checks, 10 Socket checks, 16 regression checks and restore/restart.
