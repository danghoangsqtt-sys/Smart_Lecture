# T-7401 — Authenticated learner media delivery

## Status

- `in_progress`

## Objective

Đảm bảo native video/image/object/download của học viên gửi credential hợp lệ đến media stream và không làm rò token qua referrer/cache.

## Paths

- web/src/pages/MyLearningPage.tsx
- server/src/routes/lectures.routes.ts
- tests/browser/login.spec.ts

## File-Level Plan

1. Tạo media URL có query token nhất quán cho các native browser element trong MyLearningPage.
2. Thêm response headers riêng tư cho media stream.
3. Thêm Browser E2E tạo học liệu thật, đăng nhập học viên và xác nhận tải nội dung thành công.

## Best Practices

- Encode token; không log hoặc render token thành text.
- Dọn dữ liệu test qua isolated browser harness.
- Không thay đổi access-control server-side.

## Acceptance Criteria

- [ ] Học viên đã enroll xem được image/PDF/video hoặc tải document từ My Learning.
- [ ] Request không token vẫn bị 401.
- [ ] Media response dùng private/no-referrer headers.
- [ ] Typecheck, lint và Browser E2E pass.

## Verification

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run test:browser`
