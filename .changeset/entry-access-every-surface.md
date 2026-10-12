---
"plumix": minor
---

Applies an entry's access policy on every surface that reads entries, not only on the entry's own page. The front page, the entry-type, taxonomy, author and date archives, the search page, the REST API, RPC reads and reference lookups now list a gated entry only to a principal its policy admits, and someone who may edit an entry still reads it. A soft-challenged entry is listed as a teaser: it carries `contentGated: true`, with `content` and `contentBlocks` set to `null`.

Adds `anonymousContext(ctx)` and `entryPolicyAdmits(ctx, entry, level)` to `plumix/auth`, for asking what anonymous visitors may see from someone else's request. Removes `entryAllowsAnonymousAccess`; use `entryPolicyAdmits(anonymousContext(ctx), entry, "listing")` instead.

**Breaking:** `publicEntryRows` from `plumix/db` now takes the request context instead of the plugin registry, and returns a promise: `await publicEntryRows(ctx)`. `adminEntryScope` from `plumix/plugin` now returns a promise too. An anonymous REST read no longer carries a stand-in subscriber as `ctx.user`.
