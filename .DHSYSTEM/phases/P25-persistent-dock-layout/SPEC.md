# P25 Specification — Persistent Dock Layout

## Goal

Preserve the teacher's preferred placement of floating video and game docks throughout a continuous lesson.

## Interaction

- Both dock headers are drag handles with explicit accessible labels.
- Positions are bounded within the viewport while dragging.
- The teaching-workspace snapshot stores separate positions for game and video, alongside open/minimized state.

## Verification

Browser E2E drags both docks, reloads the workspace, and verifies their positions remain moved rather than reverting to the defaults.
