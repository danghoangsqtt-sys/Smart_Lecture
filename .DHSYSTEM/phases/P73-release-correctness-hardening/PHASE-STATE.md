# Phase State — P73 Release Correctness Hardening

- Phase: `in_progress`
- Dependency: P72 completed
- Target version: `0.10.1`

| Task | Status | Verification |
| --- | --- | --- |
| T-7301 Deterministic join-before-host regression | done | deterministic run: 10/11 failed before fix; only circuit_simulate passed |
| T-7302 Joinable-room hydration | done | typecheck + REST 86/86 + Socket 10/10 + lifecycle 11/11 + regression 24/24 + restart pass |
| T-7303 Trust-proxy hardening | done | typecheck + lint + spoofed forwarded-IP rate-limit 3/3 |
| T-7304 CSP/token/dependency baseline | in_progress | pending |
| T-7305 Documentation and release-state sync | todo | pending |
