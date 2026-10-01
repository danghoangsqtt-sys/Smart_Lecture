# P80 — Biểu trưng trong giao diện (source complete)

Hoàn tất T-8001 ngày 2026-10-01 theo phản hồi người dùng: shortcut Windows đã có icon, nhưng giao diện còn ba ô chữ `SL`. Giao diện nay dùng trực tiếp `docs/icon/Icon_sm.png` trong đăng nhập, sidebar và header mobile; Vite đóng gói một bản ảnh có hash, không cần Internet hoặc AI/API key. Icon shortcut/installer và favicon/PWA hiện có không thay đổi.

## Verification

- SHA-256 của ảnh trong bundle bằng ảnh nguồn.
- `npm run typecheck`, `npm run lint`, `npm run build` đều pass.
- `npm run test:browser`: 9/9 pass, gồm kiểm tra ảnh đã tải trên desktop/mobile.
- DB và bộ cài hiện tại chưa được cập nhật; P78/P82/P90 vẫn là release gate.

## Files changed

| File | Task |
|---|---|
| `web/src/components/BrandIcon.tsx` | T-8001 |
| `web/src/components/Layout.tsx` | T-8001 |
| `web/src/pages/LoginPage.tsx` | T-8001 |
| `tests/browser/login.spec.ts` | T-8001 |
| `.DHSYSTEM/phases/P80-brand-icon-family/tasks/T-8001-icon-family.md` | T-8001 |
| `.DHSYSTEM/phases/P80-brand-icon-family/PHASE-STATE.md` | T-8001 |
| `.DHSYSTEM/phases/P80-brand-icon-family/SPEC.md` | T-8001 |
| `.DHSYSTEM/phases/P80-brand-icon-family/SUMMARY.md` | T-8001 |
| `.DHSYSTEM/TRACKER.md` | T-8001 |
| `.DHSYSTEM/HANDOFF.json` | T-8001 |
| `.DHSYSTEM/ROADMAP.md` | T-8001 |
| `CHANGELOG.md` | T-8001 |

## Next

P88/T-8802: API nghiệp vụ môn/bài dùng chung, sao chép học liệu và snapshot game. Đây không phải API AI; tích hợp AI/API key được hoãn theo yêu cầu người dùng.
