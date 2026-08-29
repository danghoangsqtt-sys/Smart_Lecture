# P30 Specification — Annotation Reducer Quality

## Goal

Make live-annotation state updates deterministic under fast draw, erase, undo and redo interactions.

## Implementation

- Move annotation strokes and history into one pure reducer.
- Keep hydration, drawing, erasing, clear-page, undo and redo as reducer events.
- Add pointer-cancel cleanup to draggable game/video dock headers.

## Quality Gate

React Doctor changed-scope scan improves from 42/100 with 6 errors to 73/100 with 0 errors. Remaining warnings are reviewed: PDF loading/render effects, an existing large Teaching Mode state surface, and intentional audible video autoplay after a teacher action.
