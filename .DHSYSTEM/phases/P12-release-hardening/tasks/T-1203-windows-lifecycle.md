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

## Execution Log

- 2026-08-28: started after T-1202 was committed, pushed and tagged. Inventory confirms existing autostart scripts are at `scripts/` and `/api/health` is defined inline in `server/src/index.ts`. Healthcheck/runbook and controlled lifecycle evidence are in progress.
- 2026-08-28: evidence captured: no Node process or listener was present on ports 4000/4100/5173, `web/dist/assets` has normal directory attributes and writable ACL, but Vite still receives Windows `EPERM` while deleting that asset directory. The selected mitigation is `emptyOutDir: false`: Vite emits content-hashed assets alongside previous artifacts, so production `index.html` always references the current build and no runtime path is deleted during build.
- 2026-08-28: complete. Added `scripts/healthcheck.ps1`; it passes for the owning production PID and rejects stale PID `999999`. Three controlled cycles each passed build, start, PID/port/API healthcheck and stop with port release on 4180 and a temporary `DATA_DIR`. Isolated E2E (86 REST, Excel route regression, 10 Socket, 16 regression, restore/restart) passed after the lifecycle changes.
