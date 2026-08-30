# P38 Specification — Slide Telemetry Integrity

## Goal

Ensure a teaching-session log records actual presentation materials when returning to slides from another content mode.

## Implementation

- Derive presentation materials separately from the currently rendered content-mode list.
- Record only PPTX/PDF presentation IDs for a slide action.
- Keep video, link and game telemetry isolated to their own activity types.

## Quality Gate

Browser E2E starts a teaching session, opens a link, returns to slides, and proves the recorded slide IDs include PPTX/PDF but exclude the link.
