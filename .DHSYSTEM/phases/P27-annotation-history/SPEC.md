# P27 Specification — Annotation Undo/Redo History

## Goal

Make pen and eraser corrections predictable during live teaching.

## Interaction

- Drawing a stroke records an add action.
- Per-stroke erasing records a remove action.
- Undo reverses the latest action; redo reapplies it in sequence.
- A new drawing or erasure clears the redo path.

## Verification

Browser E2E draws a real PDF annotation, erases it, undoes the erasure and redoes it.
