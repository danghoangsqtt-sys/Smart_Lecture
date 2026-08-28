# P15 Specification — PPTX Readiness

## Goal

When a PowerPoint has no PDF sibling, the teacher may request an in-place conversion without re-uploading or leaving Teaching Mode. The original PPTX remains unchanged; a PDF sibling is created for the annotation canvas.

## Contract

`POST /api/materials/:materialId/convert-pptx`

- Only the class-owning teacher or administrator can call it.
- The material must be a PPTX. A non-PPTX returns `400`; a missing item returns `404`; an unauthorized caller returns `403`.
- The operation is idempotent: an existing PDF sibling is returned instead of duplicated.
- LibreOffice is detected at conversion time, not only during server-info access. If unavailable, the server returns an explicit recoverable `409`.
- Conversion failure returns `422`; source files and prior content stay intact.

## UX

Teaching Mode makes the conversion state explicit and offers conversion only for an unconverted PPTX. After success it refreshes the material set and opens the resulting PDF through the existing annotation canvas.
