# REQ-20260929-004 â€” Upgrade Multer and bound multipart fields

- Type: BUG
- Priority: high
- Status: planned
- Planned phase: P78 / T-7801
- Audit tier: 3
- Detected: 2026-09-29

## Gap

The installed dependency is `multer@2.2.0`. `npm audit --omit=dev` reports multiple remotely triggerable denial-of-service advisories and recommends an upgrade. Upload middleware generally bounds file size but not files, fields, parts, field nesting, or array indexes.

## Evidence

- `server/package.json` allows the affected 2.x range and the lock currently resolves 2.2.0.
- Upload routes exist in classes, lectures, questions, RAG, teaching plans, and curriculum documents.
- Audit result: one high and related moderate/low Multer advisories; patched releases are available.

## Acceptance criteria

- Upgrade to a patched Multer release and compatible types.
- Configure route-appropriate limits for file count, fields, parts, nesting, and array indexes in addition to file size.
- Add malformed multipart and aborted-upload regression tests.
- `npm audit --omit=dev` has no high/critical result attributable to Multer.
