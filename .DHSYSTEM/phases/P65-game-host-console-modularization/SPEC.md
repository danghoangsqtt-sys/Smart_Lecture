# P65 SPEC — Game Host Console Modularization

## Problem

The host game console still behaves correctly, but `HostConsole` and `HostSandboxViews` have accumulated too many independent render branches. React Doctor reports both as high-complexity components, which makes future classroom-game changes harder to review safely.

## Scope

- Decompose the host console into small views grouped by game/lifecycle responsibility.
- Keep Socket events, state ownership, navigation, API calls, text, accessibility labels, and visual classes unchanged.
- Make `HostConsole` an orchestration boundary and `HostSandboxViews` a thin dispatcher.
- Restore the changed-scope React Doctor gate to zero diagnostics.

## Design Contract

- `useHostConsoleEffects` remains the single realtime lifecycle owner.
- `HostConsole` continues to own reducer state and all Socket/API callbacks.
- Extracted views are presentational and communicate only through typed props.
- No new endpoint, Socket event, database migration, game rule, or persistence format is introduced.
- Existing Browser selectors and user-visible flows remain compatible.

## Non-goals

- Redesigning the host UI.
- Changing game mechanics, scoring, timing, or authorization.
- Moving state to global context or introducing a new component framework.

## Acceptance Criteria

1. Lobby, hand raise, crossword, sandbox games, tug of war, math race, quiz rounds, and final results render through focused views.
2. The live/recovered circuit debrief export remains available and unchanged.
3. Typecheck, production Browser E2E, backend regression, and diff checks pass.
4. React Doctor changed scope reports no diagnostics and no host-console complexity warning.
