# T-1201 — Baseline, version và tài liệu vận hành

## Objective

Thiết lập một development baseline duy nhất `0.9.0` (trên functional baseline P11 `0.8.0`) và loại bỏ drift giữa metadata, system API, backup và tài liệu vận hành.

## Paths

- `package.json`, `server/package.json`, `web/package.json` — nguồn version package.
- `server/src/version.ts` (new) — hằng version dùng chung server.
- `server/src/routes/system.routes.ts` — trả version chính xác.
- `server/src/services/backup.ts` — ghi manifest version chính xác.
- `README.md`, `.DHSYSTEM/PROJECT-META.md`, `.DHSYSTEM/ROADMAP.md`, `.DHSYSTEM/TRACKER.md` — đồng bộ trạng thái và hướng dẫn.
- `docs/SPEC.md`, `docs/PLAN.md`, `.DHSYSTEM/HANDOFF.json` — phân biệt functional baseline P11 với development target hiện tại.
- `scripts/e2e-smoke.ps1` — so sánh system-info với version package, không hard-code version cũ.
- `scripts/verify-release-baseline.mjs` (new) — kiểm tra version/documentation deterministic.

## File-Level Plan

1. Tạo một nguồn version server duy nhất, đồng bộ bằng script với package metadata, không hard-code lặp lại ở route/backup.
2. Đưa `system/info`, backup manifest và E2E assertion về cùng version.
3. Chuyển roadmap lịch sử thành trạng thái hoàn thành/ngoài phạm vi có giải thích; giữ history không mất dấu.
4. Tạo script verify đọc-only để phát hiện drift, rồi chạy trong CI hoặc release checklist.

## Best-practice checklist

- Không dùng version tự do ở nhiều module.
- Không sửa schema/API ngoại trừ correction trường version.
- Giữ tài liệu tiếng Việt, paths repo-relative và không ghi secret.

## Acceptance Criteria

- Không còn literal app version cũ trong runtime/backup.
- Metadata mô tả P11 completed và P12 planned.
- `npm run typecheck`, build sạch và release-baseline check pass.

## Verification

`npm run typecheck`; `npm run build`; `node scripts/verify-release-baseline.mjs`.

## Execution Log

- 2026-08-28: started. Version target reconciled to `0.9.0`; P11 remains the verified functional baseline `0.8.0`.
