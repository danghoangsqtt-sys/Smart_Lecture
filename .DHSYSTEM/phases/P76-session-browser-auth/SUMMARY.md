# P76 Summary — Session Revocation & Browser Authentication

P76 makes credential changes terminate stale access consistently and removes reusable bearer credentials from browser-readable persistence.

- JWT claim `sv` is checked against `users.session_version` for REST, media and Socket.IO; password/reset/recovery and lock transitions revoke older sessions.
- Browser sessions use a time-bounded `HttpOnly`, `SameSite=Strict` cookie with same-host Origin protection for unsafe requests; HTTPS deployments can opt into `Secure` with `SESSION_COOKIE_SECURE=true`.
- Browser state contains only the current public user in memory. Legacy persisted auth is cleared, media URLs contain no token, and Socket.IO reads the cookie during its handshake.
- Font Awesome is bundled, external runtime font/style dependencies are gone, and CSP explicitly permits only the local/data/blob/socket sources required by the LAN app.
- Verification: session revocation 7/7, browser security 9/9, Browser E2E 6/6, typecheck, lint, production build and release baseline passed.
- The running installed legacy instance and its database were not modified.
