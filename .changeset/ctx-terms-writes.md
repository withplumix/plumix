---
"plumix": minor
---

Adds `ctx.terms.create`, `ctx.terms.update`, `ctx.terms.delete` and `ctx.terms.assign`, the write path core's own term procedures take: a plugin's term write runs the meta pipeline, fires the term lifecycle actions, enforces `ifMatch` and the edit lease as `term.update` does, and purges the CDN. `ctx.terms.assign` attaches an entry to a term and purges the entry's page and the term's.

A `null` in `ctx.entries`' `storedMeta` now clears that key.

A page that references an entry it could not show, such as a draft, is now stored under that entry's tag, so publishing it purges the page.
