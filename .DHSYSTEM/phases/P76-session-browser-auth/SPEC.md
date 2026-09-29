# Phase 74 â€” Session Revocation & Browser Authentication

## Goal

Make password/account changes terminate stale access consistently and reduce exposure of browser credentials in the direct-LAN deployment.

## Design contract

- A versioned authentication claim is checked against the current user row for every REST and Socket.IO authentication.
- Password change/reset/recovery and security-sensitive status changes increment the version atomically.
- Same-origin browser authentication no longer persists a bearer token in JavaScript-readable storage.
- Media/PDF/video and Socket.IO flows continue to work without query-string bearer tokens.
- CSP is enabled with local assets by default; any necessary network origin is explicit and documented.

## Compatibility

- Existing tokens may be invalidated once during upgrade; users can log in again.
- Direct HTTP LAN remains supported. Cookie/transport flags must be environment-aware and must not claim HTTPS protection when absent.
