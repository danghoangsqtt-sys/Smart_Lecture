# P32 Specification — Viewport-resilient Teaching Docks

## Goal

Keep the floating game and video controls reachable when a teacher changes projector resolution, enters/exits fullscreen, zooms the browser, or restores an old workspace layout.

## Implementation

- Clamp restored and dragged dock positions to keep a 260px control region and the header visible.
- Re-clamp both positions on `window` and `visualViewport` resize events.
- Preserve existing persisted positions when they are still valid.

## Quality Gate

Browser E2E injects out-of-range saved positions, reloads the teaching workspace, and verifies both dock handles remain inside the usable viewport.
