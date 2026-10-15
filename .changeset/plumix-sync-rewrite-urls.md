---
"plumix": minor
---

Adds URL rewriting to `plumix sync`: the source site's origin and base path inside JSON content (block trees, rich-text links, entry, term and user meta, settings) now point at the target, so a pulled site links to itself. The dry run prints a count of rewritten values per table, and `--no-rewrite-urls` turns the rewrite off.
