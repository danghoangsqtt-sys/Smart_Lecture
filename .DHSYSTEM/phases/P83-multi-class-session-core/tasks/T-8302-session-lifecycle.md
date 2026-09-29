# T-8302 — API lifecycle buổi dạy đa lớp

## Objective

Tạo, khôi phục và kết thúc đúng một buổi dạy cho một nhóm 2–4 lớp.

## Paths

- `server/src/routes/teachingLogs.routes.ts`
- `server/src/utils/access.ts`
- `server/src/types.ts`
- `scripts/e2e-regressions.mjs`

## Plan

1. Bổ sung hợp đồng API nhóm có Zod: `sourceClassId`, danh sách class ID duy nhất và môn/bài thuộc lớp nguồn; giữ nguyên endpoint một lớp hiện có.
2. Authorize giáo viên/admin trên **từng** lớp, không chỉ lớp nguồn. Trong transaction, chặn phiên active giao nhau; retry cùng yêu cầu trả lại đúng phiên, yêu cầu khác xung đột rõ ràng.
3. Đóng băng danh sách lớp sau start; end chỉ đóng một phiên chung. Read endpoint trả lớp tham gia để UI/reconnect không suy đoán từ browser storage.

## Acceptance

- 1, 4, 5 lớp; ID trùng, lớp không có quyền, môn/bài sai lớp và concurrent start đều có kết quả định nghĩa rõ.
- Một phiên một lớp cũ start/resume/end và báo cáo vẫn như trước.
- Tất cả mutation qua auth, Origin check hiện có và Zod; không có quyền chỉ từ client-supplied `classId`.

## Status

- `todo`
