# T-7802 â€” Direct-LAN Proxy and Rate-Limit Boundary

## Objective

Prevent forwarded-header spoofing from changing rate-limit identity in the default deployment.

## Paths

- `server/src/index.ts`
- `server/src/config.ts`
- `server/src/routes/auth.routes.ts`
- `scripts/auth-rate-limit-test.mjs`
- `README.md`
- `docs/HUONG-DAN-CAI-DAT.md`

## File-Level Plan

1. Disable proxy trust by default for the direct LAN server.
2. Add an explicit configuration for trusted proxy IPs/subnets; reject ambiguous numeric-hop defaults.
3. Confirm global/login limit keys use the actual direct client address.
4. Document proxy mode separately from the normal launcher/installer flow.

## Verification Contract

- Rotating `X-Forwarded-For` cannot bypass the default login/global limits.
- Explicit trusted proxy tests resolve the intended client without trusting arbitrary hops.

## Status

- `todo`
