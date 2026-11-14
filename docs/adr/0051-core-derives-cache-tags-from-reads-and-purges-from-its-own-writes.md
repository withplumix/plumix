# Core derives cache tags from reads and purges from its own writes

Keeping the CDN correct has two halves: a stored response carries the cache tag
of everything it read, and a write purges every tag that read it. The two
halves met only by convention (#3249). A reader named tags with `tagCdnEntry`,
`embeddedCacheTags`, an archive's `result.tags` or a view's `tags`. A writer
called `enqueuePurgeTags` or fired a lifecycle action core happened to listen
to. Plugins wrote core's tables through `ctx.db`, so writes from media, menu and
forms got past every purge core would have made. Six closed bugs (#1508, #1700,
#2391, #2400, #2762, #2782) and the comments fix in #2962 were each one missed
purge, fixed at its own call site.

> **Core derives a response's cache tags from what was read through it, and
> the tags to purge from what was written through it, in the same request. A
> plugin writes core's entities only through core: `ctx.entries`, `ctx.terms`
> and `ctx.settings.write`. For data core doesn't model, a plugin calls
> `ctx.cache.reads(key?)` and `ctx.cache.changed(key?)` in a namespace core
> names after it. No plugin spells a cache tag.**

## What this means

- **Reads declare.** Core's read helpers declare what they read: template-dep
  loaders, the entry list, author resolution, reference hydration, the
  settings loaders, `compileEntryQuery` and `taxonomyTermRows`. A lookup
  adapter names the core entity its ids resolve to with `kind`, and core
  tags every id it hydrated under that kind's tag.
- **Core's writes purge.** The write functions are the ones core's own RPC
  procedures call, so one path runs the meta pipeline, the lifecycle actions,
  the [ADR 0048](0048-core-guards-every-edit-with-a-required-token-and-an-enforced-lease.md)
  guard and the purge. The request memo is invalidated by the same writes.
- **Tag spelling is private to core.** `packages/core/src/cdn/contract/tags.ts`
  holds it, and nothing on a `plumix` subpath builds or enqueues a tag.
- **Core's writes emit what its purge listens to.** Core's purge subscribes to
  the `entry`, `term` and `user` events and `settings.groupChanged`, and core's
  write functions emit them, so a write through core can't skip its purge. A
  plugin never emits one to purge.
- **A lint rule enforces the write side.** `plumix/no-core-table-write` in the
  plugin config of `@plumix/eslint-config` fails a direct `insert`, `update` or
  `delete` on a table from `plumix/schema`. A plugin's own tables, and reads of
  core's, are not linted.

## Considered options

- **Hooks or events a plugin emits as the purge path** (rejected). A purge that
  waits for a plugin's event fires only when the writer remembered to emit it,
  so a direct write and a private settings group still slip past. That is how
  the bugs above happened. Core's own writes emit the events instead.
- **The entry change feed** (rejected). It covers only `entries`, not terms,
  users or settings, and it is drained outside the request, so a purge would lag
  the write and the request memo would serve the old row.
- **Enforcement by docs alone** (rejected). The tag helpers were documented, and
  first-party plugins still missed purges. A lint error finds the write before it
  ships.
- **Keep the tag helpers for plugins beside the derived tags** (rejected). Two
  ways to tag leave the hand-spelled one free to drift from core's purge, as the
  sitemap's taxonomy scope did.

## Consequences

- `tagCdnEntry` (`plumix/plugin`), `enqueuePurgeTags`, `entryTag`, `typeTag`,
  `termPurgeTags` and `entryPurgeTags` (`plumix/db`) and
  `LookupAdapter.embeddedCacheTags` are removed with no deprecation shims.
- A plugin that read core's content through `ctx.db` and named its tags by hand
  reads through core's helpers instead, or stays untagged.
- A plugin has no user write functions, because no plugin writes users.
