# P17 Specification — PowerPoint Converter Preflight

## Goal

When a selected scope contains PPTX material, classroom preflight reports whether LibreOffice is available on the local teaching server. This is operational information only; it does not alter source material or attempt a conversion.

## Contract extension

The existing teaching-readiness response includes `powerPointConversion`:

- `required`: whether the scope includes a PPTX source;
- `available`: `true` or `false` when required, otherwise `null`;
- `note`: an actionable neutral explanation.

The detector is cached after its first lookup, so regular preflight requests do not repeatedly launch an external process.
