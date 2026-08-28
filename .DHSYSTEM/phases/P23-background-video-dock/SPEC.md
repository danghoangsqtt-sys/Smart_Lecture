# P23 Specification — Background Video Dock

## Goal

Let a teaching video continue running while its floating dock is minimized, without covering slides or interrupting classroom activity.

## Interaction

- Minimizing hides the picture while retaining the same video element and playback lifecycle.
- The dock exposes its minimized/background state, can be restored, dragged and sent to native Picture-in-Picture.
- The selected video and minimized state persist in the teaching-workspace session snapshot.

## Verification

Browser E2E opens a video dock beside a real PDF canvas, minimizes it, verifies the player remains attached, and verifies it is restored after page reload.
