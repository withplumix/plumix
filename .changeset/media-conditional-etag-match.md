---
"@plumix/plugin-media": patch
---

Fixes conditional requests on the media serve route when the client sends more
than one entity-tag. `If-None-Match` is a comma-separated list, and every entry
past the first arrives with the separator's whitespace still attached — so
stripping a `W/` prefix before trimming never anchored, and a weakened tag in
any position but the first fell through to a full 200 with the bytes
re-streamed. The matcher now trims first, and revalidation answers 304 for a
listed tag wherever it sits and whether or not a proxy weakened it.
