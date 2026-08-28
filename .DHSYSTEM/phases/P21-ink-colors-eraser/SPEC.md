# P21 Specification — Ink Colors and Per-stroke Eraser

## Goal

Give teachers practical PowerPoint-style ink controls during a presentation: selectable pen/highlighter colors and a precise eraser that removes one annotation without interrupting the lesson.

## Interaction

- Pen offers red, blue, green and black ink; highlighter offers yellow, green, pink and blue ink.
- Each stroke stores its selected color, so annotations retain their visual meaning after reload.
- The per-stroke eraser removes the touched stroke, or the nearest compatible stroke when tapping close to it.
- Erased strokes enter the existing undo/redo history. Clearing the current page remains available separately.

## Reliability

- PowerPoint-converter discovery no longer blocks the Teaching Hub. The hub renders a checking state and refreshes once the background detection completes.
- Browser verification covers blue pen ink, workspace reload, game dock coexistence and per-stroke erasing on a real PDF canvas.
