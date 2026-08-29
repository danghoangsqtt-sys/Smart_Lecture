# P33 Specification — Non-interrupting Video Reopen

## Goal

Ensure the teacher can return from slides or games to a minimized floating video without restarting or replacing the active video.

## Implementation

- When a floating video exists, the Teaching Mode Video action expands that exact dock.
- A new video is created only when no floating video exists.
- The saved playback checkpoint remains unchanged while reopening the dock.

## Quality Gate

Browser E2E confirms reopening the minimized video exposes its controls while retaining the 1:13 playback checkpoint.
