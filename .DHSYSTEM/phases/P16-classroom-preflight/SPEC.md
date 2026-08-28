# P16 Specification — Classroom Preflight

## Goal

Before entering Teaching Mode, a teacher can inspect whether the selected class and optional subject have curriculum items linked to lectures, presentation sources ready for the canvas, PPTX files awaiting conversion, videos and links. The result is an inventory, not a quality judgment.

## API

`GET /api/classes/:classId/teaching-readiness?subjectId=:subjectId`

- Owner teacher/admin only; students receive `403`.
- A supplied subject must belong to the class or receives `400`.
- `curriculum` reports all items and items linked to lectures.
- `materials` reports presentation count, PDF canvas-ready count, all PPTX count, PPTX awaiting conversion, videos and links.
- Counts are restricted to the chosen class/subject.

## UI

The Teaching Hub displays a compact preflight card that follows the existing class and subject filter. It makes only factual statements about connected content and offers a direct workspace action.
