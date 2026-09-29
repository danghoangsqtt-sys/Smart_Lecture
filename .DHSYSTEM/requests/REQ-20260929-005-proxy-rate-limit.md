# REQ-20260929-005 â€” Prevent spoofed client IPs from bypassing rate limits

- Type: BUG
- Priority: high
- Status: planned
- Planned phase: P78 / T-7802
- Audit tier: 3
- Detected: 2026-09-29

## Gap

The server listens directly on all LAN interfaces but unconditionally trusts one proxy hop. A direct LAN client can influence `req.ip` with forwarded headers, weakening the global and login IP rate limits.

## Evidence

- `server/src/index.ts:40` sets `trust proxy` to `1`.
- `server/src/index.ts:102` listens on `0.0.0.0` and the launcher exposes the server directly without a reverse proxy.
- `server/src/routes/auth.routes.ts` relies on IP-based `express-rate-limit` in addition to account lockout.

## Acceptance criteria

- Default direct-LAN mode does not trust forwarded headers.
- Proxy trust is opt-in and restricted to explicitly configured proxy addresses/subnets.
- Tests prove changing `X-Forwarded-For` cannot bypass limits in the default deployment.
