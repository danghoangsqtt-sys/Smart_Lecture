# P22 Specification — Non-interrupting Game Dock

## Goal

Keep the teaching presentation usable while a teacher opens, minimizes or restores the game dock.

## Interaction

- The embedded game dock never auto-opens the game-rule modal.
- Teachers can still open **Cách chơi** deliberately from inside the dock.
- The standalone Games page preserves its first-use guide behavior.

## Verification

Browser E2E restores a minimized game dock beside the real PDF canvas and asserts that no dialog blocks annotations.
