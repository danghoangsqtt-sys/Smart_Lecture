# Phase State — P86 Roster Preflight

- Phase: `complete`
- Milestone target: `0.12.0` (not shipped)
- Source: `docs/brainstorm/session-2026-09-30.md`, `REQ-20260930-013`
- Dependency: P86 kiểm kê chỉ đọc được người dùng yêu cầu bắt đầu trước khi P78–P82 release gate hoàn tất; không được phát hành trước các gate đó.

| Task | Status | Verification |
|---|---|---|
| T-8601 Roster preflight read-only | done | 5/5 fixture tests + typecheck/lint/build; DB thực chỉ đọc |

## Notes

- 2026-09-30: hợp đồng và kế hoạch file đã ghi trước khi triển khai. P83–P85 cũ bị thay thế; migration v26 giữ nguyên.
- 2026-09-30: CLI/test triển khai; 5/5 fixture tests, typecheck, lint, build PASS. Kiểm kê read-only hai DB: repo sạch (62 học viên), bản cài bị chặn (3 thiếu mã, 1 chưa có lớp). Tác vụ vẫn `in_progress` cho đến khi kiểm tra git persistence/commit theo dh-auto; không áp migration vào DB bản cài.
- 2026-09-30: commit `99e8607` và checkpoint tag đã push lên `origin/main`; T-8601 đạt git persistence gate. Phase P86 hoàn thành, P87 cần giải quyết dữ liệu bản cài trước khi bật ràng buộc.
