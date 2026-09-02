# T-6401 — Circuit Debrief Export

## Objective

Let the teacher archive or share one authorized circuit learning debrief in CSV/XLSX without weakening P63 privacy.

## Paths

- `server/src/routes/games.routes.ts`
- `server/src/utils/spreadsheet.ts`
- `web/src/pages/GamesPage.tsx`
- `scripts/circuit-restart-test.mjs`
- `tests/browser/login.spec.ts`
- `.DHSYSTEM/ARCHITECTURE.md`
- `.DHSYSTEM/phases/P64-circuit-debrief-export/*`
- `.DHSYSTEM/TRACKER.md`
- `.DHSYSTEM/ROADMAP.md`
- `.DHSYSTEM/HANDOFF.json`
- `CHANGELOG.md`

## File-Level Plan

- Games route: reuse the P63 read model, build safe report rows once, and return CSV/XLSX with correct headers.
- Spreadsheet utility: expose or add formula-neutralization support if required without changing existing exports unexpectedly.
- Games page: add shared export actions to live and recovered debrief views with token, download, busy, and toast handling.
- Restart integration: inspect real CSV/XLSX contents and authorization/invalid-format behavior.
- Browser integration: assert real downloads from the recovered report.
- Documentation: capture exported fields, exclusions, spreadsheet safety, evidence, and completion state.

## Best-Practice Checklist

- Reuse one authorized debrief loader.
- Use prepared SQL and bounded validated metrics.
- Prefix formula-like user text before CSV/XLSX serialization.
- Never export raw JSON or internal learner IDs.
- Set explicit content types and safe filenames.
- Revoke browser object URLs after download.
- Keep buttons accessible and prevent duplicate clicks while exporting.

## Verification Contract

- Typecheck/build and React Doctor 100/100 or no confirmed issue.
- Browser E2E verifies CSV/XLSX download names from a recovered report.
- Backend E2E parses CSV and XLSX contents and covers invalid format/authorization.
- Full regression, `git diff --check`, and post-push persistence checks pass.

## Status

- `completed`

## Verification

- `npm run typecheck`: PASS.
- `npm run build`: PASS as part of Browser E2E.
- React Doctor changed scope: 90/100, 0 errors; two existing host-component complexity warnings, no P64-specific correctness issue.
- `npm run test:browser`: PASS, 4/4 with real CSV/XLSX downloads.
- `npm run test:e2e`: PASS, REST 86/86, Socket 10/10, security/data 22/22, restore and circuit restart/export parsing PASS.
