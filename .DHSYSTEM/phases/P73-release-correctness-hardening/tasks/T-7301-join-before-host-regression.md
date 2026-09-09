# T-7301 — Deterministic join-before-host regression

## Status

- `in_progress`

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

- [ ] Test tái hiện lỗi trên implementation cũ.
- [ ] Test bao phủ learner-first lobby cho mọi game type.
- [ ] Test bao phủ negative cases finished/invalid room.

## Verification

- `node scripts/game-join-race-test.mjs` trên server E2E cô lập: fail đúng trước T-7302.

