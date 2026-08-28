# Phase State — P21 Ink Colors and Per-stroke Eraser

- Phase: `completed`
- Dependency: P20 completed

| Task | Status | Verification |
| --- | --- | --- |
| T-2101 Selectable presentation ink and highlight colors | completed | typecheck + production build + browser PDF canvas test |
| T-2102 Per-stroke eraser and non-blocking converter check | completed | browser E2E + REST/security regression |

## Result

Teachers can switch colors from the floating presentation toolbar. Ink persists with its color across workspace reloads; direct touch/click and nearby taps remove a single annotation, while undo/redo remains intact. PPTX converter discovery is asynchronous so it cannot delay Teaching Hub readiness.
