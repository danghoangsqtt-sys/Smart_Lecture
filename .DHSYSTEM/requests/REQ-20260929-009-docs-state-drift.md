# REQ-20260929-009 â€” Reconcile release docs and DHSYSTEM state

- Type: BUG
- Priority: low
- Status: planned
- Planned phase: P82 / T-8201
- Audit tier: 1-2
- Detected: 2026-09-29

## Gap

Code/package versions agree on 0.9.2 and phases through P72 are complete, but release/state documents still contain stale status and incomplete coverage.

## Evidence

- `README.md` says P1-P70 complete although P71-P72 are complete.
- `.DHSYSTEM/HANDOFF.json` reports `0.9.2-planned` while package/runtime metadata report 0.9.2.
- `CHANGELOG.md` keeps completed Windows launcher/installer work under Unreleased.
- P1-P4 have no phase-state directories; P70 has no completion tag; P7/P8 use a different status-key convention.
- `.DHSYSTEM/ARCHITECTURE.md` has no diagram applicability/source matrix or sidecar Mermaid sources.

## Acceptance criteria

- Align README, CHANGELOG, HANDOFF, ROADMAP, TRACKER, and package/runtime versions.
- Document historical phase-state/tag exceptions or normalize them without rewriting published history.
- Add the architecture diagram applicability/source matrix and required sidecar files.
