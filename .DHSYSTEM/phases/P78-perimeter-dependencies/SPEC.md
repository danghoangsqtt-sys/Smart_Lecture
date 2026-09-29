# Phase 76 â€” Upload, Network & Dependency Security

## Goal

Close confirmed upload and client-IP trust weaknesses and leave every production dependency advisory patched or explicitly risk-assessed.

## Design contract

- Every Multer route specifies minimum viable file/field/part/nesting/index limits in addition to file size.
- Direct-LAN mode trusts `req.socket.remoteAddress`, not client-supplied forwarded headers.
- Reverse-proxy support is opt-in and restricted to configured addresses/subnets.
- Dependency upgrades preserve spreadsheet import/export and file-upload contracts.

## Quality gate

- No high/critical production advisory.
- Crafted multipart and `X-Forwarded-For` tests fail safely without process/resource exhaustion or rate-limit bypass.
