# T-8001 â€” Generate and Integrate the SmartLecture Icon Family

## Objective

Adopt the supplied new artwork across all web and Windows surfaces with legible small-size variants.

## Paths

- `docs/icon/Icon_sm.png`
- `docs/icon/Icon_sm.ico`
- `web/public/icon-master.png`
- `web/public/icon-16.png`
- `web/public/icon-32.png`
- `web/public/icon-48.png`
- `web/public/icon-180.png`
- `web/public/icon-192.png`
- `web/public/icon-512.png`
- `web/index.html`
- `web/public/manifest.json`
- `scripts/install-desktop-shortcut.ps1`
- `scripts/build-installer.ps1`
- `installer/SmartLecture.iss`
- `scripts/verify-icon-family.mjs`

## File-Level Plan

1. Preserve the supplied PNG as the large lockup source and derive/approve a simplified text-free app mark for small sizes.
2. Generate deterministic PNG and multi-frame ICO outputs with a verification script.
3. Replace web/PWA references and package the ICO for manual shortcuts, installer shortcuts, setup and uninstall metadata.
4. Include cache/version validation so browsers and Windows do not retain the old icon unexpectedly.

## Verification Contract

- Automated dimensions, alpha, padding and ICO-frame checks.
- Manual light/dark inspection for tab, PWA, Desktop, Start Menu, setup and uninstall list.

## Status

- `todo`
