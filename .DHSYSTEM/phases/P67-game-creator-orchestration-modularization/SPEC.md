# P67 SPEC — Game Creator Orchestration Modularization

## Problem

`CreateGameTab` still combines data loading, context selection, mode-specific payload serialization, create/save requests, circuit-template editing, and form rendering. The full React Doctor scan identifies it as the final high-complexity function in `GamesPage`.

## Scope

- Extract pure payload serialization for questions, KTTX, crossword, and circuit modes.
- Extract the presentational game-creation workspace from state/effect orchestration.
- Keep API endpoints, request shapes, validation gates, defaults, toasts, and room handoff unchanged.
- Remove the `CreateGameTab` complexity diagnostic without suppression.

## Design Contract

- Question/class/subject loading semantics remain unchanged.
- Circuit templates and simulation challenge circuits serialize exactly as before.
- Crossword readiness and selected-question submit gates remain unchanged.
- “Tạo phòng” and “Lưu sẵn” use one shared payload builder.
- No server, Socket, schema, persistence, score, or game-rule change.

## Acceptance Criteria

1. Payload building is a typed pure function outside React.
2. `CreateGameTab` owns orchestration while a focused workspace renders mode-specific editors/settings.
3. React Doctor changed scope reports no diagnostic and full scan no longer lists `CreateGameTab`.
4. Typecheck, Browser E2E, backend regressions, restart recovery, and diff checks pass.
