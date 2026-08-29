# P35 Specification — Fullscreen Presentation Controls

## Goal

Keep slide navigation and ink tools available while a teacher projects in fullscreen.

## Implementation

- Request fullscreen on the full presentation shell rather than the PDF surface alone.
- Keep the header, page navigation, undo/redo and floating pointer toolbar inside fullscreen.
- Provide an explicit in-app exit action and fullscreen state label.

## Quality Gate

Browser E2E enters fullscreen, verifies the laser control remains visible, exits fullscreen and completes all teaching continuity regressions.
