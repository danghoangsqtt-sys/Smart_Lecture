# P64 SPEC — Circuit Debrief Export

## Problem

P63 lets teachers reopen durable circuit debriefs, but the report cannot yet be archived, shared, or attached to a lesson record outside SmartLecture.

## Scope

- Add host-authorized CSV and XLSX export for one valid finished circuit debrief.
- Include session metadata, class-level summary, and learner-level metrics.
- Add export actions to both the live finish view and recovered recent reports.
- Reuse the P63 validated read model; never parse or export raw result JSON in a second path.

## Export Contract

- Endpoint: `GET /games/:id/circuit-debrief/export?format=csv|xlsx`.
- Default format is XLSX; other values return `BAD_INPUT`.
- Authorization, game type, finished status, and debrief availability are identical to the single-report P63 endpoint.
- Filename is ASCII-safe and contains the immutable session ID.
- CSV includes UTF-8 BOM; XLSX contains one readable worksheet with bounded column widths.
- Text controlled by users is neutralized against spreadsheet formula injection.

## Data Contract

The export contains:

- report title, session ID, room code, finish time;
- learner count, completed-all count, total completion ratio/rate, submitted attempts, incorrect attempts;
- learner name, completed/total challenges, submitted attempts, incorrect attempts, and score.

It excludes user IDs, topology, reference circuits, validation feedback, assistance messages, authentication data, and raw JSON.

## Non-goals

- Bulk export across multiple sessions.
- PDF rendering or print layout.
- Editing/importing exported files.
- Cross-session analytics.

## Acceptance Criteria

1. Host downloads both CSV and XLSX with correct content type, filename, metadata, summary, and learner rows.
2. Student/unrelated teacher access remains rejected through the P63 authorization boundary.
3. Invalid format and unavailable/corrupt debriefs fail safely.
4. Live and recovered UI expose accessible export actions with busy/error feedback.
5. Browser and backend integration verify real downloads while all regressions remain green.
