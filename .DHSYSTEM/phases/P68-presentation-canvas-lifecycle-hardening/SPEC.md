# P68 SPEC — Presentation Canvas Lifecycle Hardening

## Problem

The PDF/PPTX presentation surface already supports pen, highlight, shapes, underline, laser, eraser, undo/redo, and session persistence. Its file-change lifecycle still hydrates derived “ready” state through effects and renders pages through an async effect that can update view state after awaits. React Doctor reports five correctness/maintainability findings in this core teaching surface.

## Scope

- Remount the document surface by source identity and initialize annotations/settings directly from session storage.
- Preserve safe legacy-key migration without storing signed media URLs when a material ID exists.
- Harden async document/page rendering cancellation.
- Move pure pointer normalization out of render and avoid chained stroke filter/map.
- Keep all annotation tools, shortcuts, colors, page/zoom/fullscreen controls, and persistence behavior unchanged.

## Design Contract

- `sourceUrl` identity creates an isolated document/annotation lifecycle.
- Stored annotations remain capped at 100 strokes with undo/redo history reset after hydration.
- Settings accept only existing palette colors and retain the same defaults.
- PDF document/render work must not update a disposed surface.
- No backend, conversion, media authorization, teaching-session, or annotation schema change.

## Acceptance Criteria

1. Annotation/settings initialization no longer requires “ready-for-key” state or prop-sync effects.
2. Switching material identity cannot leak document state, strokes, settings, or async renders across surfaces.
3. Pen/highlight/laser/shape/eraser/undo/redo and session persistence Browser flows remain green.
4. React Doctor changed scope reports no diagnostics; full scan removes the targeted presentation findings.
5. Typecheck, Browser E2E, backend regressions, restart recovery, and diff checks pass.
