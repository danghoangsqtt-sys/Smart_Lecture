# Phase State — P12 Release hardening

- Phase: `in_progress`
- Version target: `0.9.0`
- Dependency: P11 completed
- Quality gate: release gates in `docs/SPEC.md` section 6.

## Tasks

| Task | Status | Dependency | Verification |
| --- | --- | --- | --- |
| T-1201 Baseline/version/docs | in_progress | — | typecheck, clean build, documentation consistency scan |
| T-1202 Excel/dependency security | planned | T-1201 | audit, ADR, import/export regression |
| T-1203 Windows lifecycle | planned | T-1201 | three clean build/start/stop cycles, healthcheck |
| T-1204 Browser quality gate | planned | T-1201 | isolated browser E2E in CI |

No shipping code is changed in this planning checkpoint.
