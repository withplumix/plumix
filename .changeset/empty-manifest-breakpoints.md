---
"@plumix/core": patch
---

Fixes `emptyManifest()` omitting `breakpoints`, so a manifest fixture built
from it (including via the public `@plumix/core/test/playwright` helpers) now
carries the theme's default breakpoints instead of `undefined`, matching what
`buildManifest()` itself always populates.
