# Phase State — P87 Home Class Identity

- Phase: `in_progress`
- Milestone target: `0.12.0` (not shipped)
- Dependency: P86 complete; P78–P82 release gates still required before release.

| Task | Status | Verification |
|---|---|---|
| T-8700 Remove explicitly designated test students | done | 3 exact IDs removed; SQLite backup verified; FK/integrity clean; 4 CLI tests and project checks pass |
| T-8701 Staged schema and legacy readiness gate | done | v27 + real-data backup rehearsal clean; fixture conflict/missing/rollback-retry; typecheck/lint/build/focused/full E2E PASS |
| T-8702 Atomic student creation and writer consolidation | done | account+enrollment+history atomic; routes/JSON/Excel/form gated; roster contract 8/8, focused, full E2E, Browser 7/7, React Doctor 100 |
| T-8703 Users Excel and single-class UI | done | shared modal/template, read-only preview, idempotent import; roster Excel 8/8, focused/full E2E, Browser 8/8, React Doctor 100 |
| T-8704 Transfer, archive/delete and session revocation | todo | historical grade/attendance and auth tests |

## Notes

- 2026-09-30: P86 found installed data requiring real student codes and one class assignment before constraint enforcement. No live remediation performed.
- 2026-09-30: người dùng xác nhận ba học viên thiếu mã là tài khoản thử không quan trọng và yêu cầu xóa; T-8700 được thêm trước migration. Không tự xóa tài khoản khác.
- 2026-09-30: đã xóa đúng 3 học viên thử (không có lịch sử ngoài 2 enrollment), còn 1 admin và 1 lớp. Backup riêng tại `%LOCALAPPDATA%/SmartLecture/data/backups/pre-test-student-delete-2026-09-30T09-11-40.950Z-4bd62dc0-6aaa-40ac-b727-14c493c41e52.db`, SHA-256 `65269536133678df49a9ae13eb639857fa079e7ae3c1582d39ff46e7a0ec8be0`. P86 re-audit ready, không có FK/integrity lỗi. Không tạo dữ liệu thử mới trong DB bản cài; tests dùng fixture tạm.
- 2026-09-30: T-8702 hợp nhất các đường tạo học viên vào transaction duy nhất, bắt buộc mã và lớp; import lớp không sửa mật khẩu/mã tài khoản đã có, không tự chuyển lớp. Tạm chặn xóa ghi danh/lớp còn học viên cho đến T-8704. Mọi test dùng DB cô lập; DB bản cài không bị nâng cấp bởi task này.
- 2026-09-30: T-8703 cho nhập Excel/CSV từ Người dùng và từ tab lớp bằng cùng modal; preview chỉ đọc, xác nhận luôn kiểm tra lại. Mẫu không có tài khoản ví dụ và có tên lớp; cột Lớp khác lớp đã chọn bị từ chối theo dòng. Không tạo/sửa dữ liệu trong DB bản cài.
