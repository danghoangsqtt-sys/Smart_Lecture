# T-7602 â€” Browser Credential and CSP Hardening

## Objective

Remove long-lived bearer credentials from JavaScript-readable storage while preserving reload, media and realtime UX.

## Paths

- `server/src/index.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/middleware/auth.ts`
- `server/src/realtime/socketAuth.ts`
- `web/src/stores/authStore.ts`
- `web/src/lib/api.ts`
- `web/src/realtime/socket.ts`
- `web/index.html`
- `web/src/App.tsx`
- `tests/browser/login.spec.ts`

## File-Level Plan

1. Move same-origin authentication to an HttpOnly, SameSite session transport suitable for direct HTTP LAN, with configurable Secure behavior for HTTPS deployments.
2. Add origin/CSRF protections for mutations and a deliberate logout/expiry contract.
3. Remove bearer query parameters from same-origin media flows and stop persisting token material in Zustand storage.
4. Vendor or remove external runtime assets, enable Helmet CSP and enumerate only required sources.
5. Migrate/clear the legacy `smart-lecture-auth` value safely.

## Verification Contract

- Login, reload, logout, forced password change, video/PDF/image streaming and Socket reconnect pass.
- Browser tests assert no token in local/session storage, URL or rendered DOM.

## Status

- `todo`
