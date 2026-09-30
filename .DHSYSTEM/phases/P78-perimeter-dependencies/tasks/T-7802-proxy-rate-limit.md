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
- `.DHSYSTEM/ARCHITECTURE.md`

## File-Level Plan

1. `server/src/config.ts`: keep direct-LAN `TRUST_PROXY=false`; accept only comma-separated, validated proxy IP/CIDR entries; fail startup on `true`, numeric hops, aliases, invalid CIDR and all-address `/0`.
2. `server/src/index.ts`: apply the validated exact proxy address/subnet list before rate-limit middleware; document why Express's `req.ip` is safe only after the trust boundary is set.
3. `server/src/routes/auth.routes.ts`: retain the existing failed-login limiter and clarify that its default IP key follows the same validated Express trust boundary.
4. `scripts/auth-rate-limit-test.mjs`: isolated scenarios for direct LAN, an untrusted socket peer despite configured proxy CIDR, and an explicitly trusted loopback proxy; rotate spoofed header entries against both login and global API limits. Verify invalid proxy configuration fails startup.
5. `README.md`, `docs/HUONG-DAN-CAI-DAT.md`, `.DHSYSTEM/ARCHITECTURE.md`: document direct-LAN default, scoped proxy opt-in, ingress/header requirements and examples; remove numeric-hop guidance.

## Best Practices

- Trust only the immediate proxy's source IP/CIDR, not every forwarded hop or arbitrary client input. Require proxy to overwrite inbound `X-Forwarded-For`, and prevent direct public access to the backend in proxy mode.
- Preserve Express/express-rate-limit default IP key generation (including IPv6 subnet handling); test the observed 429 behavior rather than exposing a debug IP endpoint.
- Run network tests on an isolated temporary data root, not the installed application.
- Stack cache (`.DHSYSTEM/STACKS.md` and global node-express-ts summary) is unavailable; follow `SYSTEM-RULES.md` and installed Express/express-rate-limit behavior.

## Verification Contract

- Rotating `X-Forwarded-For` cannot bypass the default login/global limits.
- Explicit trusted proxy tests resolve the intended client without trusting arbitrary hops.

## Verification Commands

- `npm run typecheck`, `npm run lint`, `npm run build` — all pass.
- `node scripts/auth-rate-limit-test.mjs` — direct/untrusted/trusted and invalid-config cases pass with 429 where expected.
- `npm run test:focused` and `npm run test:e2e` — existing auth and application flows pass.

## Status

- `in_progress`
