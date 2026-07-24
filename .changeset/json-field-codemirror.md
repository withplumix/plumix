---
"@plumix/admin": minor
---

Give the metabox `json()` field a syntax-highlighted code editor. The plain
textarea is replaced with a CodeMirror editor (line-number gutter, JSON
highlighting, bracket matching) that keeps the same behaviour — blank clears
the value, valid JSON propagates, invalid JSON surfaces an inline parse error
and leaves the last good value in place. The editor is code-split, so a form
with no JSON field never loads the CodeMirror chunk.
