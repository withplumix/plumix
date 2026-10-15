---
"plumix": minor
---

Adds `plumix import <dir|file.jsonl>`, which loads a sync dump or a file of authoring records into the local site, or the deployed one with `--url`. Every record is checked against the site's entry types, taxonomies and fields first, and a failing one is reported by file and line with nothing written.
