# P31 Specification — Video Resume Recovery

## Goal

Preserve a teacher's floating-video progress across a teaching-workspace reload, without relying on muted autoplay or disrupting the presentation.

## Implementation

- Persist a video playback checkpoint: current position and whether playback was active.
- Record checkpoints every five seconds while playing, and immediately on play/pause.
- Restore the selected video, dock state and saved position after a workspace reload.
- Attempt to continue only when the browser permits it; otherwise expose a clear teacher action to continue audible playback.

## Quality Gate

`typecheck`, production build and isolated Browser E2E pass. Browser E2E proves a 1:13 checkpoint is retained through reload. React Doctor changed scope has zero errors.
