# P18 Specification — Teaching Workspace Recovery

## Goal

An accidental browser reload must not discard a teacher's local workspace context while an active teaching log remains on the server. Restoration is local to the current browser session and never creates a new teaching session or changes telemetry.

## Stored context

Per class/subject session-storage state contains selected plan/item, content mode, game-dock open/minimized state and selected video material ID. Unknown or no-longer-authorized items are ignored during restoration.

## Boundaries

- The active teaching session is still authoritative on the server and is loaded normally.
- Game/video media is not duplicated or auto-created during recovery.
- Closing the browser session clears the local recovery state naturally.
