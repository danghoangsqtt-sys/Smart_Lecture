# T-7303 — Trust-proxy hardening

## Status

- `todo`

## Objective

Đảm bảo direct-LAN deployment không tin forwarded client IP mặc định, nhưng vẫn hỗ trợ reverse proxy khi cấu hình explicit.

## Paths

- server/src/config.ts
- server/src/index.ts
- scripts/auth-rate-limit-test.mjs
- README.md

## File-Level Plan

1. Thêm parser cấu hình `TRUST_PROXY` với mặc định an toàn cho LAN trực tiếp.
2. Chỉ gọi `app.set('trust proxy', ...)` khi cấu hình được bật.
3. Mở rộng regression để chứng minh spoofed `X-Forwarded-For` không bypass limit mặc định.
4. Ghi tài liệu cho deployment đứng sau proxy.

## Acceptance Criteria

- [ ] Direct LAN mặc định không trust proxy headers.
- [ ] Proxy mode có thể bật explicit.
- [ ] Login rate-limit regression pass và spoofed header không bypass mặc định.

## Verification

- `node scripts/auth-rate-limit-test.mjs`
- `npm.cmd run typecheck`
- `npm.cmd run lint`

