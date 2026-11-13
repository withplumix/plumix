---
"plumix": patch
---

Fixes a deploy serving pages the previous build cached. Every CDN store entry is now keyed by the build that rendered it, so after a deploy a page renders afresh instead of returning the old HTML with stylesheet and script URLs the new build no longer serves, and the old entries expire by their `ttl`.
