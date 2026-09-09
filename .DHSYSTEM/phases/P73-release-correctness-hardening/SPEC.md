# Phase 73 — Release Correctness Hardening

## Goal

Loại bỏ race condition khi học viên tham gia phòng game vừa tạo, củng cố cấu hình bảo mật cho mô hình LAN, đánh giá rủi ro dependency hiện hữu và đồng bộ tài liệu/trạng thái phát hành mà không thay đổi hợp đồng REST/Socket công khai.

## Architecture

- SQLite tiếp tục là nguồn sự thật cho phiên game vừa tạo.
- Memory room map là cache/runtime state; join lobby phải có thể hydrate an toàn từ SQLite dù host chưa attach.
- Chỉ `circuit_simulate` được phục hồi khi đang `running`; các game không có durable runtime state không được hồi sinh giả sau restart.
- Cấu hình reverse proxy phải explicit; mặc định phù hợp triển khai trực tiếp trong LAN.
- CSP và token persistence được harden theo hướng tương thích ngược, có browser regression trước khi chốt.
- Không refactor các màn hình lớn trong phase này để giới hạn blast radius.

## Tasks

| Task | Outcome | Dependency |
| --- | --- | --- |
| T-7301 | Regression test tái hiện learner join trước host | — |
| T-7302 | Loader phòng joinable loại bỏ race condition | T-7301 |
| T-7303 | Trust-proxy an toàn theo cấu hình triển khai | T-7302 |
| T-7304 | CSP/token/dependency security baseline | T-7303 |
| T-7305 | Đồng bộ docs, governance và release metadata | T-7304 |

## Acceptance Criteria

- Learner có thể join mọi game lobby trước khi host Socket attach.
- Không thể join phòng finished/cancelled hoặc phòng running không hỗ trợ durable recovery.
- REST 86/86, Socket 10/10 và lifecycle 11/11 pass ổn định.
- Direct-LAN mode không tin `X-Forwarded-For` mặc định.
- Production CSP không phá PDF/video/PPTX/Socket.IO/browser flow.
- Không có high/critical production dependency vulnerability.
- README, CHANGELOG, ROADMAP, HANDOFF và version `0.10.1` nhất quán.

## Phase Verification

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run test:e2e`
- `npm.cmd run test:browser`
- `npm.cmd audit --omit=dev`

