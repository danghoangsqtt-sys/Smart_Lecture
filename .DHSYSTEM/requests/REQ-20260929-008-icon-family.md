# REQ-20260929-008 â€” Replace and normalize the SmartLecture icon family

- Type: ENH
- Priority: medium
- Status: planned
- Planned phase: P80 / T-8001
- Audit tier: 3
- Detected: 2026-09-29

## Gap

Two replacement assets exist in `docs/icon`, but the web app, PWA manifest, manual desktop shortcut, and installer still use the old raster family or the Windows shell icon. The supplied ICO contains only one 100x100 frame, which is not a complete Windows icon family, and the detailed wordmark will lose legibility at favicon sizes.

## Acceptance criteria

- Choose a master brand asset and create simplified small-size artwork where needed.
- Generate 16, 24, 32, 48, 64, 128, and 256px ICO frames plus 16/32/48/180/192/512 PNG outputs.
- Update `web/index.html`, `web/public/manifest.json`, launcher shortcut creation, installer setup/uninstall icon, and packaged assets.
- Verify browser tab, PWA, Desktop, Start Menu, installer, and Windows uninstall list on light/dark backgrounds.
