# P19 Specification — Presentation Canvas Validation

## Goal

Browser E2E must load a real PDF into Teaching Mode, render the PDF canvas, draw a pen annotation and retain the annotation after a browser reload. This validates the core classroom interaction path with an actual document rather than mocked UI state.

## Boundaries

The fixture is generated in memory and uploaded only to the isolated browser-test database. No project media or classroom data is changed.
