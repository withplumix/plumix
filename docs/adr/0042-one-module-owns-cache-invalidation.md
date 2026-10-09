# One module owns cache invalidation

Keeping the CDN correct has two halves. A response that reads something must
carry that thing's cache tag, and a write must purge every tag that reads it.
Core's half was one list of lifecycle actions, but everything outside it met
only by convention: a plugin spelled tags with `typeTag` and `entryTag`, stored
a response under them with `tagCdnEntry`, purged with `enqueuePurgeTags`, and
had to know which type set a term archive used. Six closed bugs were a write
that left cached pages stale, each fixed at its own site (#1508, #1700, #2391,
#2400, #2762, #2782). The architecture review that filed #2985 found more of
the same: media edits, meta-only user saves and term-linked menu items purged
nothing, and the sitemap worked out a taxonomy's tags differently from core's
term purge. A response stored under the wrong key is wrong, not absent, so
under ADR 0002 getting it right is core's job.

> **A read says what it read and a write says what it changed, in the domain's
> terms: an entry, an entry type, a taxonomy, a term, a user, a settings group,
> or a plugin's own record under a namespace of its own (`CacheRead`,
> `CacheWrite`). One rule in `plugin/cache-tags.ts` spells both as cache tags,
> and a write's tags are the tags of every read it changes. A plugin records a
> read with `recordRead` and a write core cannot see with `recordWrite`, and
> never spells a tag. Core's own writes record theirs through their lifecycle
> hooks.**

## What this means

- **The rule is the only place a tag is spelled.** `readTags` and `writeTags`
  are the whole vocabulary. The request memo, the CDN store and the purge
  all take their tags from them, so the memo and the CDN cannot disagree about
  what a write drops either. `normalizeTag` stays below them, where the memo
  and the accumulators lower-case what they are handed.
- **A write reaches what it changed.** An entry write reaches the entry and
  its type, a term write the term and its taxonomy, a user write the user and
  every public type (every public page prints its author, and a delete
  reassigns entries without an entry write), a settings save the group, and a
  plugin write its own record.
- **Each entity kind has its own tag.** Terms (`tm:<id>`) and users (`u:<id>`)
  gained a per-entity tag that pages are stored under, so a menu item or a
  reference field that shows one is reached by its write. A user's tag used to
  drop memo entries only.
- **A media reference reads the media library as a whole** (`t:media`), not
  each picture. A page can show a picture for every entry it lists, and a
  sitemap page lists hundreds, so a tag per picture would overrun what a CDN's
  tag header holds. Media writes are rare, so clearing every page that showed
  a picture is the cheaper error.
- **Archives, views, sitemap sources and OG card keys say what they read.**
  `CustomArchiveResolution.reads`, `ViewResolution.reads`, a sitemap source's
  `reads` and `CardKey.read` replace the tag lists they used to carry.
- **A listener that re-purged what a read already records is gone.** The SEO
  and feeds plugins read their settings through `loadSettingsGroups`, which
  records the read, so core's purge of a saved group reaches them with no
  listener of their own.
- **A test proves the property.** `memoryCdn()` in `plumix/test` stores and
  purges for real, so a test renders a page, makes a write and asserts the
  stored page is gone, instead of asserting the tags either side spelled.

## Considered options

- **Purge from the entry change feed** (rejected). The feed is the one write
  record a direct write cannot bypass, but it is drained after the request,
  and the request memo has to drop an entry before the writer's next read in
  the same execution (#2517). It also covers the `entries` table alone, not
  terms, users or settings. Hooks stay the trigger, and a direct writer
  records its write.
- **Keep the tag minters public beside the new calls** (rejected). Any place
  a plugin can spell a tag is a place its tag can drift from the rule, which
  is the bug this decision closes. TypeScript reports every caller of the
  removed names.
- **Put the rule in `cdn/contract/`** (rejected). The rule reads the
  registry's type sets, and the request memo in `context/` and the plugin
  contracts both speak it. Under ADR 0010 a contract importing the
  `AppContext` unit from `cdn/contract/` would close a cycle, so the rule lives
  in `plugin/`, beside the type sets, and `cdn/invalidation.ts` holds the
  per-request calls built on it.
