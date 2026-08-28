# T-1501 — Conversion readiness and authorization

## Result

- Added `POST /materials/:id/convert-pptx` with owner-teacher/admin authorization.
- Detects LibreOffice on demand rather than depending on a previous system-info visit.
- Returns existing PDF sibling without duplication; returns explicit `409` when unavailable and `422` for invalid conversion output.
- Regression covers student denial, non-PPTX rejection and recoverable converter state.
