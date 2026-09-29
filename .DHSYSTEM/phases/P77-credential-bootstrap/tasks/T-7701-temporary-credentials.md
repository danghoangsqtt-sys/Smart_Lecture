# T-7701 â€” One-Time Imported Credentials

## Objective

Generate unique temporary credentials for newly imported users and force secure first-login replacement.

## Paths

- `server/src/routes/users.routes.ts`
- `server/src/routes/classes.routes.ts`
- `server/src/routes/auth.routes.ts`
- `web/src/pages/UsersPage.tsx`
- `web/src/features/class-detail/StudentsTab.tsx`
- `server/src/utils/spreadsheet.ts`
- `scripts/e2e-regressions.mjs`
- `tests/browser/login.spec.ts`

## File-Level Plan

1. Centralize temporary-password generation and user insertion semantics.
2. Replace `Hocvien@123` and username fallbacks with per-user random credentials.
3. Mark all temporary-password accounts for mandatory first-login change.
4. Return a one-time authorized result/export for credentials created in that request; never persist or re-display plaintext later.
5. Preserve existing-user enrollment without password mutation and replace browser `prompt()` reset UI with the project modal pattern.

## Verification Contract

- JSON, CSV and XLSX imports cover blank/explicit passwords, duplicates and existing users.
- First login cannot access protected APIs/Socket.IO until the password changes.

## Status

- `todo`
