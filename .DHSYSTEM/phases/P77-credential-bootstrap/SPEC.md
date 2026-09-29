# Phase 75 â€” Secure Credential Bootstrap

## Goal

Remove shared and username-derived student passwords while preserving practical bulk enrollment for Vietnamese classrooms.

## Design contract

- Blank passwords produce cryptographically random, per-account temporary credentials.
- Explicit import passwords are treated as temporary unless a documented trusted workflow opts out.
- Temporary credentials are returned exactly once to authorized staff and always set `must_change_password = 1`.
- Existing accounts are never assigned a new password merely because they appear in another enrollment import.
- Logs, error payloads and durable application tables never store plaintext temporary passwords.

## Quality gate

- CSV/XLSX and JSON imports, manual creation, duplicate users and first-login change are covered.
