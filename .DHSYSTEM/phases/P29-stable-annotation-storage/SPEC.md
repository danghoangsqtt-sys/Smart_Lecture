# P29 Specification — Stable Annotation Storage

## Goal

Keep presentation annotations addressable by the teaching material rather than by a tokenized streaming URL.

## Behavior

- Annotation and color-preference keys use the media material identifier.
- Existing URL-keyed session values are read once and migrated to the stable key.
- Token values are not retained in annotation storage keys.

## Verification

Browser E2E retains the saved PDF annotation and color selection after workspace reload and asserts no annotation storage key includes a URL token.
