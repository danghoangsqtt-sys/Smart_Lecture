# Phase 77 â€” mDNS Lifecycle & Reliable Quality Gates

## Goal

Make mDNS an optional convenience that cannot crash SmartLecture or block unrelated regression suites.

## Design contract

- Server startup owns explicit Bonjour/service handles and closes them once on graceful shutdown.
- Duplicate names, missing Bonjour and socket errors degrade to LAN-IP access.
- Isolated tests can disable mDNS without changing production defaults.
- Focused suites isolate auth, database upgrade, spreadsheet and mDNS failures before the full E2E chain.
