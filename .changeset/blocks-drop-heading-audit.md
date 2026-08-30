---
"@plumix/blocks": minor
---

Removes `analyzeHeadingStructure` and `HeadingAuditViolation` (breaking, pre-1.0).

The audit outlived its only consumer. It backed `HeadingAuditPanel` in the Puck-era editor, which
went when that editor did (#1143); four days later #1226 taught it to read headings out of the
unified rich-text block — keeping working code that no longer had a caller. Nothing has imported it
since. It was never re-exported from the curated `plumix/blocks` façade either, so reaching it meant
depending on `@plumix/blocks` directly.
