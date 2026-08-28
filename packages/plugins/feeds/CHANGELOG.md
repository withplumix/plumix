# @plumix/plugin-feeds

## 0.1.0

### Minor Changes

- [#2046](https://github.com/withplumix/plumix/pull/2046) [`0d81cce`](https://github.com/withplumix/plumix/commit/0d81ccefd10144ab09316386fa46cc114ec9a080) Thanks [@nasyrov](https://github.com/nasyrov)! - Moves RSS and Atom out of core and into `@plumix/plugin-feeds`. Syndication is something a site
  opts into: a crawler does not read a feed, a reader subscribes to one, and a site that wants
  neither should not carry the largest module in core's SEO folder. Core's `feed.ts`, its five
  dispatcher branches, its `seo:feed:items` filter and the archive-type `feed` field are gone.

  **Breaking.** An existing site loses `/feed` until it installs the plugin. The migration is two
  lines:

  ```ts
  import { feeds } from "@plumix/plugin-feeds";

  plugins: [blog(), feeds()],
  ```

  All six scopes serve as they did — the site, an entry type, a taxonomy term, an author, a date
  period and a `registerArchiveType` archive — in both formats, at the same paths, with the same
  twenty-item window and the same `<link rel="alternate">` discovery tags. A private site still 404s
  every feed. Two names moved with the code: the item filter is now `feed:items`, and the `feed`
  field on `registerArchiveType` is now the plugin's own type augmentation rather than a core field,
  so a plugin declaring one adds `@plumix/plugin-feeds` to its dependencies.

  Routes are claimed during `theme:ready` through `registerPublicRoute`, which is what makes the
  enumeration honest: the plugin registers a concrete path per registered entry type and per
  taxonomy archive space rather than matching `/…/feed` shapes per request. Three consequences are
  visible:

  - A nested term under a hierarchical taxonomy now advertises its own nested feed, where core
    advertised none for any nested term.
  - A trailing-slash feed URL 301s onto the feed for every scope. Core only exempted `/feed*` from
    the normalizer, so `/feed/` 404'd while `/post/feed/` redirected; the exemption added in [#2042](https://github.com/withplumix/plumix/issues/2042)
    matched the _normalized_ path, which would have spread that 404 to every scope. It now matches
    the literal path, so all of them redirect. This revises the exemption [#2042](https://github.com/withplumix/plumix/issues/2042) shipped — the case
    it was preserving was a bug, not a behaviour.
  - An archive's `feed.routes` entry must end in `/feed`. Core's dispatcher only ever consulted
    archive feeds on that suffix, so anything else was dead; registering it verbatim would instead
    shadow the archive's own page, because a public route answers ahead of the content router.
    Non-conforming routes are ignored, as before.

  Core gains the small surface a plugin at the site root needs, all of it code core already had:
  `ctx.plugins` on the plugin setup context — the same read-only registry `AppContext.plugins`
  carries at request time, complete by the time `theme:ready` fires — plus `buildEntryPermalink`,
  `termTaxonomyBaseSlug`, `findTermByPath`, `dateRange`, `exposesHierarchicalUrls` and `nonEmpty`
  on the barrel. A feed or a sitemap that spelled any of those itself would drift from the pages it
  points at the first time a rewrite option moved one.

- [#2051](https://github.com/withplumix/plumix/pull/2051) [`4d52b72`](https://github.com/withplumix/plumix/commit/4d52b72d2c91249aa1bae560fa68dea10873b87b) Thanks [@nasyrov](https://github.com/nasyrov)! - Preselects the SEO and feeds plugins in `create-plumix-app`. Both now declare `recommended: true` in
  their `plumix.scaffold` block, the wizard opens its plugin step with them ticked, and a run with no
  `--plugins` flag takes them — so the realistic default project serves head meta, `robots.txt`, a
  sitemap and feeds on first run rather than none of them.

  The recommendation is the plugin's, not the scaffolder's: `loadRegistry` carries the flag into the
  descriptor and `recommendedPluginIds` reads it back, so a future plugin opts into the default project
  by editing its own `package.json`.

  Flags still decide, in both directions. `--plugins <ids>` replaces the recommended set rather than
  adding to it, so `--plugins blog` scaffolds blog alone, and `--plugins=` scaffolds none. A
  deselected plugin leaves behind no import, no registration and no dependency of its own — the one
  exception being a package another selected plugin declares as a peer, as `@plumix/plugin-og` does
  for `@plumix/plugin-seo`.
