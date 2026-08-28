# T-1203 — Build và lifecycle Windows

## Objective

Làm cho build, start, stop, healthcheck và phục hồi hoạt động lặp lại được trên máy giáo viên Windows.

## Paths

- `package.json` — orchestration scripts nếu cần.
- `web/vite.config.ts` — chiến lược output build nếu cần.
- `scripts/install-autostart.ps1`, `scripts/uninstall-autostart.ps1` — lifecycle Task Scheduler.
- `scripts/healthcheck.ps1` (new) — kiểm tra PID/port/API không phá huỷ.
- `README.md` — runbook vận hành.

## File-Level Plan

1. Tái hiện và ghi nguyên nhân lock `web/dist` bằng process/handle evidence.
2. Chọn lifecycle rõ ràng: dừng process trước build an toàn hoặc build sang artifact rồi atomically phục vụ.
3. Chuẩn hóa file PID sao cho stale PID tự bị phát hiện, không được coi là process sống.
4. Chạy ba chu kỳ build/start/stop/restart trên DB test hoặc môi trường kiểm soát.

## Acceptance Criteria

- `npm run build` pass ba lần liên tiếp theo runbook Windows.
- Healthcheck phân biệt được process sống, PID stale và API chưa sẵn sàng.
- Không xóa data runtime hoặc backup trong bước build/lifecycle.

## Verification

Build three times; healthcheck; `npm run test:e2e`; restore/restart check.
