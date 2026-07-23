---
"@plumix/core": minor
"plumix": minor
---

Read-time reference hydration is now cache-correct: a page that embeds a referenced entity carries that entity's cache tag and is purged when the entity changes. A per-request accumulator collects tags during hydration and the public read-through folds them into the page's stored cache tags, so editing, deleting, or otherwise changing an embedded entry busts the pages that hydrated it (the entry adapter contributes its precise `e:<id>` tag through the existing purge pipeline). Lookup adapters gain an optional `embeddedCacheTags(payload)` method to declare the tag a hydrated payload contributes; kinds without a per-entity purge identity (e.g. `user`) omit it. A new server-side `hydrateReferences(ctx, kind, ids, { scope })` helper gives themes the same batched adapter path and tag accounting for id-only reference fields, resolving an id set in one in-query per chunk and returning the hydrated payloads dense and in requested order. Pages that hydrate nothing are tagged exactly as before.
