# P39 Specification — Direct Advanced Ink Colors

## Goal

Allow teachers to choose an ink color directly after selecting circle, underline or straight-line tools.

## Implementation

- Show the pen-color palette for every non-laser, non-eraser drawing tool.
- Retain the distinct highlighter palette for highlight mode.
- Preserve existing material-scoped color persistence.

## Quality Gate

Browser E2E selects the circle tool by keyboard and verifies the pen-color palette is immediately available.
