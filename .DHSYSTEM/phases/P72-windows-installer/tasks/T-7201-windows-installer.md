# T-7201 — Distributable Windows installer

## Status

- `completed`

## Paths

- package.json
- package-lock.json
- server/package.json
- web/package.json
- server/src/version.ts
- scripts/build-windows-installer.ps1
- installer/SmartLecture.iss
- installer/start-smartlecture-installed.ps1
- README.md
- CHANGELOG.md

## File-Level Plan

1. Đồng bộ phiên bản feature release thành 0.10.0.
2. Build server/web và dựng staging payload với production dependencies cùng Node runtime.
3. Compile installer per-user có shortcut, uninstall và persistent data directory.
4. Tạo checksum, smoke-test payload đã đóng gói và cập nhật hướng dẫn phát hành.

## Pre-execution documentation gate

- [x] Paths và acceptance criteria đã xác định trước khi sửa shipping code.
- [x] Không thay đổi schema/API/UI contract.
- [x] Dữ liệu người dùng được tách khỏi application payload.

## Verification

- `npm run build:installer`: pass; staged payload healthcheck passed.
- Silent clean install to isolated directory: exit 0.
- Installed bundled runtime `/api/health`: pass on isolated port 4400.
- Silent uninstall: exit 0 and installation directory removed.
- `npm run typecheck`, `npm run lint`: pass.
- Production audit: no high/critical vulnerability; two moderate transitive findings remain under ExcelJS/uuid.
