---
"@plumix/core": minor
"@plumix/plugin-media": minor
---

Remove the redundant `lookup.resolve` RPC and `LookupAdapter.resolve`.

The single-reference admin picker now resolves its selected id through the
batched `lookup.list({ ids })` path (the same path the multi-reference picker
and the meta read/write pipeline already use), so the dedicated
`lookup.resolve` procedure had no remaining caller. It is removed along with
its `LookupAdapter.resolve` contract method — `list({ ids })` covers single-id
resolution, so a lookup adapter now implements one query method (`list`) plus
the optional `hydrate`/`embeddedCacheTags`. The built-in `user`, `entry`,
`term`, and `media` adapters drop their `resolve` implementations accordingly.

`lookup.resolve` was the authenticated admin RPC surface only (not REST- or
public-exposed), so no public HTTP contract changes.

Migration: if you implemented a custom `LookupAdapter`, drop its `resolve`
method — `list({ ids })` is now the single-id path. If you called the
`lookup.resolve` RPC directly, switch to `lookup.list({ ids: [id] })` and read
the single item from `items`.
