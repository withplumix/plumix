# @plumix/plugin-feeds

## 0.3.0

### Minor Changes

- [#2555](https://github.com/withplumix/plumix/pull/2555) [`6efbb39`](https://github.com/withplumix/plumix/commit/6efbb39e466eaf00eb80c3084d7578d7a6960e26) Thanks [@nasyrov](https://github.com/nasyrov)! - Applies an entry type's access policy to the surfaces that publish entry data away from the entry's own page. A type registered with `access` is gated on its own page, but three plugins republished it elsewhere to visitors the gate would have turned away.

  `@plumix/plugin-comments`: the public thread route, the REST resource and the submit handler now resolve the entry's policy before answering. Previously an anonymous visitor could read every approved comment on a members-only entry — and post to it — knowing only the entry id. All three routes are `auth: "public"`, which core answers ahead of the access gate, so they now share one `resolveCommentableEntry` that asks. A gated entry answers as a missing one, so the refusal does not report which ids exist.

  **Commenting on a gated entry now closes for everyone, including the members the gate admits.** A public route carries no principal to resolve a policy against, so the question these three ask is whether an _anonymous_ reader may see the entry — and on a gated entry the answer is no whoever is asking. A member still sees the rendered thread on the entry's own page, which is gated and therefore safe, but the form and the "load older comments" control there will refuse. If your site runs members-only content with comments, this removes a feature you had. Serving those surfaces to the member the gate admits needs a public route that can carry a policy, which core does not have yet.

  `@plumix/plugin-feeds`: a policied entry type is no longer syndicated. Its entries stay out of the site, author, date and term feeds, and the type registers no feed of its own to be asked for. A site whose only public entry type is gated now serves no feed at all, since a feed with no syndicatable type has nothing to carry.

  `@plumix/plugin-seo`: a policied entry type gets no sitemap scope — and so no sub-sitemap route — and IndexNow is not told when one of its entries is published. The same now holds for a plugin archive declaring both `access` and `sitemap`. The type keeps its SEO meta box, its SERP preview and its settings keys in the editor: search copy is still worth writing for a page a member reaches, and removing the keys would orphan values a site had already saved.

  A feed, a sitemap and an IndexNow ping are read by a client carrying no session and served from a shared cache, so there is no principal to resolve a policy against: those three exclude the whole type, as `@plumix/plugin-search` already does for its index. A type declaring `access` is therefore out even where an individual entry's policy would have admitted anyone.

- [#2500](https://github.com/withplumix/plumix/pull/2500) [`8a48f1a`](https://github.com/withplumix/plumix/commit/8a48f1a07346bb06cd148fdedc87287f9142dcf8) Thanks [@nasyrov](https://github.com/nasyrov)! - Advertises a plugin archive's feed. Every page of a `registerArchiveType` archive with a `feed` now carries the `<link rel="alternate">` RSS and Atom pair, and a later page points at the feed of the route it paginates. Nothing is advertised where the archive's `filter` answers `null`, or where another feed already claimed the path.

  Removes `feed.routes` (breaking). The feed paths now follow from the archive's own routes: each route serves RSS at `<route>/feed` and Atom at `<route>/feed/atom`, and a route ending in `FRAMEWORK_PAGINATION_SUFFIX` gets none. Drop `routes` from the `feed` object; an archive that declared `/events/:series/feed` for the route `/events/:series` keeps the same URL.

- [#2559](https://github.com/withplumix/plumix/pull/2559) [`5250cbd`](https://github.com/withplumix/plumix/commit/5250cbdbcbfa63378b65cb926fecae94e64f9886) Thanks [@nasyrov](https://github.com/nasyrov)! - Makes every feed its archive's own entry query, so a feed carries exactly what its archive's page lists, newest first and capped at twenty whatever order the page uses. Breaking changes:

  - **`feed.scope` is removed.** A plugin archive declares its entries once, in `entries`, and opts into a feed with `feed: true`: replace `feed: { scope: (q, params) => … }` with `entries: (q, params) => …` and `feed: true`. `feed` is refused on an archive without `entries`. The object form `feed: {}` is reserved for future feed-only options.
  - **Pages leave the site, author and date feeds.** An entry of a hierarchical type is no longer in `/feed`, `/authors/<slug>/feed` or `/YYYY[/MM[/DD]]/feed`, matching those pages.
  - **A type's feed moves to its archive page.** It is served at the type's `hasArchive` slug (`/news/feed` for `hasArchive: "news"`), and `/<type name>/feed` is gone. A type with no archive page — `hasArchive: false`, which includes `@plumix/plugin-blog`'s `post` — has no feed of its own; its entries are in `/feed`.
  - **Discovery follows the page's archive.** A page advertises the feed of the archive that owns it, and a single entry no longer advertises the site feed.
  - **`feed:items` receives a reshaped scope.** `scope.archive` names the archive as core's archive lookup does (`front-page`, `archive`, `taxonomy`, `author`, `date` or `custom`) and `scope.params` holds what its route captured; `scope.kind === "site"` becomes `scope.archive.kind === "front-page"`.

- [#2535](https://github.com/withplumix/plumix/pull/2535) [`e10a867`](https://github.com/withplumix/plumix/commit/e10a8677a84709e06da52c26ec846ebaa904f999) Thanks [@nasyrov](https://github.com/nasyrov)! - Replaces an archive feed's `filter` with `scope`, which narrows an entry query instead of returning raw SQL. The query arrives restricted to published entries of public types and cannot be widened, so an archive whose feed omitted a status check no longer publishes drafts or trashed entries. An archive declaring an `access` policy now gets no feed, because a feed is a public route core answers ahead of the access gate. Update `feed: { filter: (ctx, params) => sql }` to `feed: { scope: (q, params) => q… }`.

### Patch Changes

- [#2561](https://github.com/withplumix/plumix/pull/2561) [`c0e1bb4`](https://github.com/withplumix/plumix/commit/c0e1bb4dbe78aab8799f3aabbed05b3cb3e550c3) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes a feed serving an empty document instead of 404ing on a site where every public entry type declares an `access` policy.

- [#2563](https://github.com/withplumix/plumix/pull/2563) [`d7e1834`](https://github.com/withplumix/plumix/commit/d7e1834efd8621868013b9089cf1e33d2b552d39) Thanks [@nasyrov](https://github.com/nasyrov)! - Serves each feed from its archive's query after core's `archive:entries` filter, so a plugin narrowing an archive narrows its feed too.

- [#2498](https://github.com/withplumix/plumix/pull/2498) [`0d0ed89`](https://github.com/withplumix/plumix/commit/0d0ed89d772b49d8f283bc5fd5d27ed08257e1cf) Thanks [@nasyrov](https://github.com/nasyrov)! - Imports each `plumix` value from the one subpath that publishes it (`plumix/theme`, `plumix/plugin`, `plumix/runtime`, `plumix/auth`, `plumix/support`), so this release requires `plumix` 0.24.0 or later.

## 0.2.0

### Minor Changes

- [#2387](https://github.com/withplumix/plumix/pull/2387) [`c1eee70`](https://github.com/withplumix/plumix/commit/c1eee70f05d4e18a5bf946532c0e9f4e0b6bae8b) Thanks [@nasyrov](https://github.com/nasyrov)! - Caches feeds at the edge. RSS and Atom responses now send `cache-control: public, max-age=0, s-maxage=3600` and are stored under the tags of the entry types they list, so publishing, editing or trashing an entry, or saving the site settings, purges the feeds it appears in. A plugin archive's feed is cached only when the archive registered with `cacheable: true`; otherwise it is served live with no `cache-control`. A private site's feeds still answer 404 and are never stored. `createDispatcherHarness` given a `cdn` now also subscribes core's entry and term purges, so a test can observe what a mutation retires.

- [#2350](https://github.com/withplumix/plumix/pull/2350) [`29f9dec`](https://github.com/withplumix/plumix/commit/29f9dece355cc29c97611435e78ab7888fbe9326) Thanks [@nasyrov](https://github.com/nasyrov)! - Registers the routes, settings and meta boxes scoped to the site's entry types and taxonomies from the plugin descriptor's `afterSetup` rather than a `theme:ready` subscriber. Requires the `plumix` release that adds `afterSetup`: on an earlier one those registrations never run, so upgrade both together.

### Patch Changes

- [#2393](https://github.com/withplumix/plumix/pull/2393) [`4017430`](https://github.com/withplumix/plumix/commit/401743028e66c974f51a18e2461815f5a1cb4eac) Thanks [@nasyrov](https://github.com/nasyrov)! - Reads entry type and taxonomy visibility from the registered type, so these plugins now need the plumix release that resolves visibility at registration. On an older plumix they treat a type that never set `isPublic` as not public.

- [#2381](https://github.com/withplumix/plumix/pull/2381) [`381ded5`](https://github.com/withplumix/plumix/commit/381ded59d9a0ad133f280d53883e6430e15d32d3) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes the sitemap and feeds running one ancestor query per nested page or term, so a sitemap page of hierarchical content now costs a fixed number of queries. Requires the `plumix` release that adds `buildEntryPermalinks` and `buildTermArchiveUrls`.

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
