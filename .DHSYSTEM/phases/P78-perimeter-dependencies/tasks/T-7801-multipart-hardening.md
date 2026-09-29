# T-7801 â€” Multipart Parser Upgrade and Limits

## Objective

Upgrade Multer to a patched release and bound multipart resource use on every upload route.

## Paths

- `server/package.json`
- `package-lock.json`
- `server/src/routes/classes.routes.ts`
- `server/src/routes/lectures.routes.ts`
- `server/src/routes/questions.routes.ts`
- `server/src/routes/rag.routes.ts`
- `server/src/routes/teachingPlans.routes.ts`
- `server/src/routes/curriculumDocuments.routes.ts`
- `scripts/upload-security-test.mjs`

## File-Level Plan

1. Upgrade Multer/types to a patched compatible release.
2. Define route-specific `fileSize`, `files`, `fields`, `parts`, field-name, nesting and array-index limits.
3. Standardize Multer error responses without reflecting unsafe field/file input.
4. Verify aborted disk uploads do not leave orphaned files.

## Verification Contract

- Crafted field-name/index, excessive fields/parts, oversize and aborted-upload tests fail safely.
- `npm audit --omit=dev` reports no Multer high/critical advisory.

## Status

- `todo`
