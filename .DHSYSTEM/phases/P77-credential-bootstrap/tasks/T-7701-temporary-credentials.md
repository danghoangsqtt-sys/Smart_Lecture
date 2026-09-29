# T-7701 â€” One-Time Imported Credentials

## Objective

Generate unique temporary credentials for newly imported users and force secure first-login replacement.

## Paths

- `server/src/auth/temporaryCredentials.ts` — generate cryptographically random per-account temporary passwords.
- `server/src/routes/users.routes.ts` — force first change for manual/JSON-created users and return JSON import credentials once.
- `server/src/routes/classes.routes.ts` — remove username fallback and return only credentials created by the current spreadsheet import.
- `web/src/lib/credentialExport.ts` — create formula-safe, in-memory CSV credential handoffs.
- `web/src/pages/UsersPage.tsx` — explain first-change semantics and replace password-reset `prompt()` with the project modal pattern.
- `web/src/features/class-detail/StudentsTab.tsx` — show/download the one-time credential handoff before closing import results.
- `scripts/temporary-credentials-test.mjs` — cover JSON/CSV blank and explicit credentials, duplicates, first-login and Socket enforcement.
- `tests/browser/login.spec.ts` — update created-student fixtures to complete mandatory first login.
- `package.json` — expose the focused credential-bootstrap regression command.
- `.DHSYSTEM/ARCHITECTURE.md` — document the one-time plaintext boundary and non-persistence invariant.

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

- `in_progress`

## Best Practices

- Generate with `node:crypto`; never derive a password from username, student code or another account.
- Keep plaintext credentials in request-local memory only and return them only for accounts actually created by that request.
- Treat staff-supplied import/manual/reset passwords as temporary bootstrap secrets and always require the owner to replace them.
- Escape spreadsheet-formula prefixes when exporting credential handoffs and never put a password in logs, URLs, durable tables or later read APIs.
