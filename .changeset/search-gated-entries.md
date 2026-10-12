---
"@plumix/plugin-search": minor
---

Adds entries of types with an `access` policy to search. Each search lists what the searcher may see: an anonymous visitor finds the public entries, and a signed-in member also finds the entries their policies admit. A soft-gated entry is found by any word it holds, but its snippet is its excerpt and never its body. A site that already has content of a policied type should start one rebuild at `/_plumix/search/reindex` after upgrading, so those entries become findable.
