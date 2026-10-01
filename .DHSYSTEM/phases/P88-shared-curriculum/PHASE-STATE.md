# Phase State — P88 Shared Curriculum

- Phase: `in_progress` (source only; not released)
- Dependency: P87 source complete; P78–P82/P90 release gates remain.

| Task | Status | Verification |
|---|---|---|
| T-8801 Additive schema and legacy mapping | done (source only) | migration fixture 11/11; rollback/retry/idempotency; focused + full E2E pass |
| T-8802 Shared curriculum API, media copy and game snapshot | done (source only) | isolated API 20/20, migration 11/11, focused + full E2E; installed app untouched |
| T-8803 Curriculum/teaching UI | todo | Browser UX tests pending |
| T-8804 Curriculum/game/legacy regression | todo | full release gates pending |

## Notes

- 2026-10-01: T-8801 hoàn tất trong source. Chỉ áp migration trên DB fixture cô lập; không tự gộp theo tên và không chạm DB bản cài. T-8802 phải sao chép/đối soát file trước khi mở học liệu dùng chung.
- 2026-10-01: T-8802 hoàn tất trong source: route kho dùng chung, copy/kiểm tệp, snapshot game migration v30. T-8803 cần nối UI vào nguồn mới; T-8804 kiểm thử Browser và hồi quy trước release. Chưa áp migration lên DB bản cài.
