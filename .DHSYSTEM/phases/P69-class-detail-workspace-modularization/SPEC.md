# P69 SPEC — Class Detail Workspace Modularization

## Problem

`ClassDetailPage.tsx` has grown into a 2.4k-line route file that owns the class shell plus overview, students, attendance, gradebook, groups, settings, curriculum, teaching-workspace, and their modal flows. This makes a change to any classroom operation hard to review, test, and isolate even though the behavior is stable.

## Scope

- Move class-detail domains into focused frontend feature modules with typed shared contracts.
- Retain a thin route entry responsible only for route/search-param state, initial class data, authorization derivation, and tab composition.
- Preserve all existing request paths and payloads, role checks, query parameter behavior, labels, keyboard/accessibility semantics, exports, dialogs, and loading/error behavior.
- Add or extend Browser coverage for opening the class detail route and exercising its core navigation without changing server contracts.

## Out of Scope

- No backend/API/schema/migration changes.
- No visual redesign, localization rewrite, or behavior change in attendance, gradebook, groups, curriculum, or teaching mode.
- No unrelated refactors in `GamesPage`, `GamePlayPage`, or `gameRoom.ts`.

## Design Contract

- Feature files stay at or below the 300-line project guideline where a coherent boundary exists.
- Shared type definitions are centralized in the new class-detail feature boundary rather than copied between tabs.
- The URL remains `/classes/:id?tab={overview|students|attendance|gradebook|groups|settings}` and falls back to `overview` for invalid or missing tab values.
- `CurriculumTab` and `TeachingModeTab` remain callable from their current public module contract until all internal imports are intentionally redirected.
- Data refresh after a mutating child flow continues to update the shell and all dependent tab views.

## Acceptance Criteria

1. `ClassDetailPage.tsx` is a thin route composition surface; each classroom concern renders from a focused module.
2. No established API endpoint, payload, authorization rule, URL contract, visible Vietnamese UI text, export flow, or accessibility label changes.
3. The existing empty/loading/error behavior and class refresh after mutations are retained.
4. Typecheck, production build, focused Browser class-detail flow, REST/Socket/security-data/restart regressions, and `git diff --check` pass.
5. React Doctor reports no new diagnostics in the changed scope and removes the targeted Class Detail complexity finding if the current scanner reports it.
