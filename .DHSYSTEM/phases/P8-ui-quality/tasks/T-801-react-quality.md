# T-801 — React accessibility, correctness và bundle

- Status: `done`

## Objective

Giảm nợ React Doctor bằng các thay đổi an toàn, ưu tiên khả năng truy cập, sandbox media và tải trang ban đầu.

## Paths

- `web/src/App.tsx`
- `web/src/components/ui.tsx`
- `web/src/pages/{ExamResults,Lab,Lectures,Rag,MyLearning,GamePlay,Games}.tsx`
- `web/vite.config.ts`
- `web/src/components/{CircuitCanvas,Layout}.tsx`
- `web/src/components/schedule/{EventModal,MonthGrid,WeekGrid}.tsx`
- `web/src/pages/{ClassDetail,TeachingMode}.tsx`

## Verification

- `npx -y react-doctor@latest . --verbose --scope changed`
- `npm run typecheck -w web`
- Vite production build vào thư mục tạm khi `web/dist` đang được server Windows sử dụng.

## Outcome

- Full-scan không còn cảnh báo accessibility/security.
- Sửa mutation ref trong render, nhãn control, tương tác lịch bằng bàn phím/native button, fetch status và listener Socket trùng.
- Thay iframe game bằng `GamesPage` lazy-loaded và truyền `initialClassId` rõ ràng.
- Entry production 209.53 kB, gzip 67.02 kB; không còn cảnh báo chunk vượt 500 kB.
- Verify: root typecheck pass; production build pass; React Doctor changed-scope 47/100 (37 vấn đề), full-scan 42/100 (61 vấn đề).
