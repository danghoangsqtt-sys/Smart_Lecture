# P37 Specification — Fast Ink Input Reliability

## Goal

Prevent lost pen/highlighter strokes when pointer down, move and up events occur before React has rendered the interim draft state.

## Implementation

- Keep the active draft stroke in a synchronous ref as well as render state.
- Update the ref before scheduling its visual update.
- Commit the ref value on pointer completion, then clear both state and ref.

## Quality Gate

Browser E2E dispatches pointer down/move/up in one browser turn and verifies the annotation is stored.
