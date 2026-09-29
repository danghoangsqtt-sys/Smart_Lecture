# T-7602 â€” Browser Credential and CSP Hardening

## Objective

Remove long-lived bearer credentials from JavaScript-readable storage while preserving reload, media and realtime UX.

## Paths

- `server/src/config.ts` — expose explicit secure-cookie configuration.
- `server/src/auth/sessionCookie.ts` — centralize cookie parsing, attributes and clearing.
- `server/src/middleware/csrf.ts` — enforce same-host Origin for cookie-authenticated mutations.
- `server/src/index.ts` — mount CSRF protection and keep a self-only Helmet CSP.
- `server/src/routes/auth.routes.ts` — set/renew/clear HttpOnly cookies and add logout.
- `server/src/middleware/auth.ts` — accept Bearer integrations or the session cookie; remove query tokens.
- `server/src/realtime/socketAuth.ts` — authenticate browser sockets from the HttpOnly cookie.
- `web/src/stores/authStore.ts` — keep only in-memory public user state and clear legacy persisted auth.
- `web/src/lib/api.ts` — use same-origin credentials without Authorization headers.
- `web/src/realtime/socket.ts` — connect with cookies and no JavaScript token argument.
- `web/src/App.tsx` and `web/src/pages/LoginPage.tsx` — hydrate `/auth/me` and use cookie login.
- `web/src/components/Layout.tsx` — renew cookie state after password change and call logout.
- `web/src/pages/` and `web/src/features/class-detail/` token consumers — remove bearer headers/query strings from downloads, uploads, media and realtime calls.
- `web/src/main.tsx`, `web/src/index.css`, `web/index.html`, `web/package.json` — vendor Font Awesome and remove runtime CDN/font dependencies.
- `scripts/curriculum-test.mjs` — replace query-token expectations with the cookie/no-query contract.
- `scripts/browser-auth-security-test.mjs` — focused cookie, CSRF, logout and CSP assertions.
- `tests/browser/login.spec.ts` — assert reload continuity and absence of tokens in storage, DOM and URLs.

## File-Level Plan

1. Move same-origin authentication to an HttpOnly, SameSite session transport suitable for direct HTTP LAN, with configurable Secure behavior for HTTPS deployments.
2. Add origin/CSRF protections for mutations and a deliberate logout/expiry contract.
3. Remove bearer query parameters from same-origin media flows and stop persisting token material in Zustand storage.
4. Vendor or remove external runtime assets, enable Helmet CSP and enumerate only required sources.
5. Migrate/clear the legacy `smart-lecture-auth` value safely.

## Best Practices

- Cookies are `HttpOnly`, `SameSite=Strict`, path `/`, time-bounded, and `Secure` only under explicit HTTPS deployment configuration.
- Keep Bearer headers for non-browser local integrations, but never return a token to requests carrying a browser Origin.
- Cookie-authenticated unsafe methods require a same-host Origin; API/Bearer automation remains backward compatible.
- Do not persist authentication material or public-user cache across browser restarts; hydrate from `/auth/me`.

## Verification Contract

- Login, reload, logout, forced password change, video/PDF/image streaming and Socket reconnect pass.
- Browser tests assert no token in local/session storage, URL or rendered DOM.

## Status

- `in_progress`
