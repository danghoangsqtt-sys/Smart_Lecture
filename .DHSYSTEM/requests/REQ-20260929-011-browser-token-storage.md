# REQ-20260929-011 â€” Reduce browser token exposure

- Type: ENH
- Priority: medium
- Status: completed
- Planned phase: P76 / T-7602
- Audit tier: 3
- Detected: 2026-09-29

## Gap

The bearer JWT is persisted in browser local storage, and Helmet content security policy is disabled. Any future same-origin script injection would be able to read the token and reuse it for up to 12 hours.

## Evidence

- `web/src/stores/authStore.ts` persists the complete auth state under `smart-lecture-auth`.
- `server/src/index.ts` calls Helmet with `contentSecurityPolicy: false`.
- `web/index.html` depends on external stylesheet/font origins.

## Acceptance criteria

- Define the LAN threat model and select an authenticated-session design that avoids persistent JavaScript-readable bearer credentials where feasible.
- Enable a tested CSP with only required origins and remove unnecessary network dependencies for the local-first build.
- Combine the change with server-side session/token revocation and XSS regression checks.

## Resolution

- Completed by P76 / T-7602 with HttpOnly cookie authentication, same-host Origin enforcement, memory-only browser auth state, local runtime assets and explicit CSP coverage.
- Verified by browser security 9/9, session revocation 7/7 and Browser E2E 6/6.
