---
"@plumix/plugin-search": patch
---

Fixes search indexing the body of an entry whose access policy holds its content back from anonymous visitors: such an entry is now indexed by its title and excerpt only, for every searcher. Documents already indexed are re-extracted by the scheduled run with no action needed, or at once by starting a rebuild.
