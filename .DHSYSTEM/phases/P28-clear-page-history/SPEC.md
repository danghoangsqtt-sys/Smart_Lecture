# P28 Specification — Clear-page History

## Goal

Prevent accidental loss when a teacher clears all annotations on the current slide.

## Interaction

- **Xóa nét trang hiện tại** records every removed annotation and its ordering.
- Undo restores all cleared annotations to the page.
- Redo clears them again.

## Verification

Browser E2E restores an erased stroke, clears the page, then verifies undo/redo of the clear-page action.
