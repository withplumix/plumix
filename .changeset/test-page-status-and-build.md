---
"plumix": minor
---

Adds `assertStatus`, `assertHeaderMissing` and `assertSeeInOrder` to the page `site.visit` returns, and a `build` option to `testSite()` that hands the site its build's asset manifest and compiled catalogs. A test site's image delivery now names the width an image asked for (`?w=400`), which the stored original still answers.
