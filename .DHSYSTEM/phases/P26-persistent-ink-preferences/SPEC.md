# P26 Specification — Persistent Ink Preferences

## Goal

Keep a teacher's pen and highlighter color choices intact across a presentation workspace reload.

## Interaction

- Pen and highlighter remember independent selected colors.
- Switching between the two tools restores that tool's own last color.
- Preferences are scoped to the presentation document in the current browser session.

## Verification

Browser E2E selects blue pen ink, reloads the workspace and confirms the blue swatch remains selected alongside the saved annotation.
