---
"plumix": minor
---

Fixes a `registerRewriteRule` capturing `:term` on a nested-URL taxonomy 404ing on a nested term: a term is now found by its slug, whatever route captured it. Core's own term archive routes 301 a non-canonical path (a bare slug or a wrong ancestor, which used to 404) to the term's canonical URL, keeping the page number and query string, while a plugin's rewrite rule serves at its own URL without redirecting. `EntryQuery.inTerm` accepts a slug or a slug path and addresses the term by its last segment. Removes `findTermByPath` from `plumix/plugin`.
