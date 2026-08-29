# P34 Specification — Teaching Video Picker

## Goal

Let a teacher select the intended instructional video when the current lesson includes more than one video, without interfering with an already active floating video.

## Implementation

- The Video action opens a compact picker only when multiple lesson videos exist and no video dock is active.
- The picker opens the selected video as a floating dock and records the teaching action.
- When a dock is active, the same action continues to expand that existing video.

## Quality Gate

Browser E2E uploads two lesson videos, selects the first through the picker, and verifies the non-interrupting reopen flow still retains playback state.
