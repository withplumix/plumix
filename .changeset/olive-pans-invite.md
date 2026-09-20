---
"plumix": minor
---

Adds `images.<role>` to every entry, term and author a template receives, typed from `ImageRoles` so `data.entry.images.featured` autocompletes and needs no meta key. A role resolves to the first field carrying it — in declaration order, through groups — whose reference the adapter turns into an image, and `null` when none does. Entries and terms project out of the hydration batch the page already runs, and a page of authors resolves in one batch, so no page kind gains a per-row query. Public REST entries carry `images` too, with a role exposed only when its own field opts in with `showInApi`. Adds `resolveImageRoles(ctx, scope, bags)` for bulk callers holding stored meta bags, which hydrates one query per reference group per chunk.
