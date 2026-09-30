# T-7801 â€” Multipart Parser Upgrade and Limits

## Objective

Upgrade Multer to a patched release and bound multipart resource use on every upload route.

## Paths

- `server/package.json`
- `package-lock.json`
- `package.json`
- `server/src/utils/uploadLimits.ts` (new)
- `server/src/utils/errors.ts`
- `server/src/routes/classes.routes.ts`
- `server/src/routes/lectures.routes.ts`
- `server/src/routes/questions.routes.ts`
- `server/src/routes/rag.routes.ts`
- `server/src/routes/teachingPlans.routes.ts`
- `server/src/routes/curriculumDocuments.routes.ts`
- `scripts/upload-security-test.mjs`
- `.DHSYSTEM/ARCHITECTURE.md`

## File-Level Plan

1. `server/package.json`, `package-lock.json`: require patched Multer 2.4.0 or newer within major v2; upgrade compatible `@types/multer` and regenerate lockfile.
2. `server/src/utils/uploadLimits.ts`: expose typed one-file limits builder with finite `fileSize`, `files`, `fields`, `parts`, `fieldNameSize`, `fieldSize`, `fieldNestingDepth`, `fieldArrayIndexLimit`, `headerPairs`.
3. Six upload route files: replace ad-hoc limits with route-specific field counts/sizes while retaining existing MIME/extension checks and file-size contracts.
4. `server/src/utils/errors.ts`: map `MulterError` to stable 400/413 JSON codes/messages; never reflect attacker-controlled field name or filename.
5. `scripts/upload-security-test.mjs`, `package.json`: isolated server regression for benign upload, crafted fields/index/depth, fields/parts/file-size overflow, and aborted disk upload cleanup.
6. `.DHSYSTEM/ARCHITECTURE.md`: document multipart boundary and limit/error behavior.

## Best Practices

- Set the minimum viable multipart limits per route, including `fieldNestingDepth` and `fieldArrayIndexLimit` supported by Multer 2.4.0.
- Keep disk-storage cleanup inside patched Multer on parser failure/abort; do not fabricate filenames from client input.
- Validate malicious cases through HTTP against an isolated data root, never the installed application.

## Verification Contract

- Crafted field-name/index, excessive fields/parts, oversize and aborted-upload tests fail safely.
- `npm audit --omit=dev` reports no Multer high/critical advisory.

## Verification Commands

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:upload-security`
- `npm run test:focused`
- `npm run test:e2e`
- `npm audit --omit=dev --json` (inspect Multer finding separately; unrelated advisories belong to T-7803)

## Status

- `done`

## Verification Record — 2026-09-30

- Multer 2.4.0 and `@types/multer` 2.3.0 installed; all six upload routers use finite per-route limits.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:upload-security`, `npm run test:focused`, and `npm run test:e2e` passed against isolated test data. Multipart regression covers valid upload, long/nested/index field names, excess fields/parts, oversize file, abort cleanup, and process health.
- `npm audit --omit=dev --json`: 0 high/critical, no Multer finding. Three remaining moderate entries (`exceljs`, `ip-address`, `uuid`) are deferred to T-7803.
