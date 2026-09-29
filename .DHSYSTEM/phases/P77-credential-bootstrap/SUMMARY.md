# P77 Summary — Secure Credential Bootstrap

P77 removes shared and username-derived passwords from user imports while keeping classroom enrollment practical.

- Blank JSON/CSV/XLSX passwords become unique crypto-random per-account secrets; supplied values remain temporary bootstrap credentials.
- Plaintext exists only in request-local memory and the creating response, which is marked `private, no-store`; it is never stored or available from later reads.
- Duplicate/existing accounts are enrolled without password mutation and never receive a credential entry.
- All staff-created, reset and imported credentials force first replacement; protected REST and Socket.IO stay unavailable until that succeeds.
- The class-import UI shows the one-time handoff and creates a formula-safe CSV in memory. Password reset uses a proper modal.
- Verification: focused credential regression 11/11, Browser 3/3, typecheck, lint and production build passed. The known isolated-suite Windows/mDNS shutdown fault remains assigned to P79.
