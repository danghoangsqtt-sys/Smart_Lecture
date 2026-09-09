# T-7301 — Deterministic join-before-host regression

## Status

- `completed`

## Objective

Tạo regression test xác định rõ hợp đồng: học viên được phép join một lobby hợp lệ ngay cả khi host Socket chưa attach và hydrate room runtime.

## Paths

- scripts/game-lifecycle-test.mjs
- scripts/game-join-race-test.mjs
- package.json

## File-Level Plan

1. Thêm test cô lập tạo lớp, enroll learner và tạo từng loại game qua REST.
2. Cố ý kết nối learner trước host, không dùng delay ngẫu nhiên để che lỗi.
3. Kiểm tra mã sai, phòng finished và running recovery boundary.
4. Thêm npm script để chạy regression độc lập và gọi từ E2E aggregate.

## Best Practices

- Test phải deterministic và tự dùng dữ liệu cô lập.
- Luôn cleanup socket/timer/process khi kết thúc.
- Không thay shipping behavior trong task tạo test đỏ này.

## Acceptance Criteria

- [x] Test tái hiện lỗi trên implementation cũ: 10 game không có fallback đều trả `Không tìm thấy phòng`.
- [x] Test bao phủ learner-first lobby cho mọi game type trong lifecycle matrix.
- [ ] Negative cases finished/invalid room được hoàn thiện cùng loader policy ở T-7302.

## Verification

- `npm.cmd run test:e2e`: fail đúng tại lifecycle matrix, 1/11 pass trước T-7302; REST 86/86 và Socket 10/10 vẫn pass.
