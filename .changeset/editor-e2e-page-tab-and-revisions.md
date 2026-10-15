---
"plumix": minor
---

Adds Page tab, revisions sheet and stale-draft controls to the `editor` fixture in `plumix/test/playwright` (`editor.document`, `editor.revisions`, `editor.staleDraft`), plus `editor.storedDocument()` and `editor.storedRevisions()`, so a test can drive and assert an entry's visibility, terms and revisions as well as its blocks.
