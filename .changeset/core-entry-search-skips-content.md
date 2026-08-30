---
"@plumix/core": patch
---

Filtering the entries list no longer matches the stored content envelope. The `LIKE` clause covered `entries.content`, whose JSON keys, block names and attribute names read as prose to a substring match, so `image`, `text`, `code` and a dozen other structural words returned most of the table. Search now runs over `title` and `excerpt`, the two columns that hold prose. Quoted phrases, `-excluded` terms and escaped wildcards are unchanged.
