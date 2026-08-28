# @plumix/plugin-seo

## 0.1.0

### Minor Changes

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

- [#2048](https://github.com/withplumix/plumix/pull/2048) [`3713278`](https://github.com/withplumix/plumix/commit/3713278acc776e4110e4f308c9da81df4f178eca) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds a per-entry and per-term **Search & social** box, and decides indexability in one place.

  An editor can now set a search title, a search description, a canonical override, a social image
  URL and `noindex` / `nofollow` on any entry or term. The fields ride the entity's own Save — no
  second save action, no new table — and store in the `meta` column under `seo_`-prefixed keys,
  because meta-box ids are deduplicated by core while meta keys are one flat namespace shared by
  every box on an entity.

  Scope is derived, not configured: every publicly-visible entry type and taxonomy gets the box, so
  internal types like menu items are excluded with no configuration. For a type that is public but
  that nobody writes search copy for, name it:

  ```ts
  seo({ metaBox: { exclude: ["landing_page"] } });
  ```

  **One predicate, several consumers.** Whether a page is offered to a search engine is decided by
  one ordered set of assertions — `site_private`, then `entry_override`, then `search_results`,
  then `default` — which short-circuits on the first that fires and reports the reason alongside the
  boolean. The robots directive reads that answer; the sitemap asks the same two questions of whole tables
  instead, as a `WHERE` over the meta column, so what they share is the meta key and this order
  rather than a call. Either way a page can no longer claim `noindex` in its head while still being
  listed in the sitemap, and the count driving the index's pagination and the page it pages agree.
  The exclusion tests `json_type(...) is not 'true'` rather than extracting the value, because
  extraction collapses JSON `true` and JSON `1` into one integer and would drop a page the head
  still said `index` for. The reason string is what a later slice shows an author, instead of a bare
  toggle.

  The `og:image` chain gains the box's social image URL as its second link — above a generated card
  and the site default, below an entry type's own `.ogImage()` role field — so a deliberate choice
  is never overruled by a generated one.

  All of it gap-fills, so a theme keeps the last word: a template that sets `document.title` or
  declares its own canonical keeps them, and the editor's override then reaches `og:title` and
  `og:url` alone. A search title is the page's title, so a theme's `titleTemplate` composes it.

  Two head tags this plugin did not write before are now its own. `<link rel="canonical">` is
  written here rather than left to core's gap-filler, since core would otherwise declare the derived
  URL an editor overrode; with no override the two agree and core simply finds the tag set.
  `<title>` is written only when an editor set a search title, so a page with no override still goes
  through the theme's own composition.

- [#2045](https://github.com/withplumix/plumix/pull/2045) [`f50a4b9`](https://github.com/withplumix/plumix/commit/f50a4b9d210cf158f2eff6368696f614d27c9435) Thanks [@nasyrov](https://github.com/nasyrov)! - **Breaking.** Core no longer emits head meta. The description, the robots directive, the Open Graph
  set, the Twitter card and the resolved social image now come from `@plumix/plugin-seo`; core keeps
  the canonical URL, its `<link rel="canonical">` and the redirect that normalizes to it.

  The boundary is drawn on consequence rather than on topic: core owns what would be _wrong_ without
  a plugin installed, a plugin owns what would merely be _absent_. A canonical URL core redirects to
  but never declares is a site contradicting itself. A missing description is a site that has not
  opted in.

  To keep today's head, install the plugin and add it to the config:

  ```ts
  import { seo } from "@plumix/plugin-seo";

  export default plumix({ plugins: [seo()] });
  ```

  The plugin reproduces every tag core emitted and adds three it did not: `article:published_time`,
  `article:modified_time` and `article:author` on an entry page. Contributions go through the existing
  `render:document` filter and are gap-filled, and they run last on that chain whatever order the
  `plugins` array is in — so a theme's own head tags keep winning exactly as they did, and so do
  another plugin's.

  The `seo:og_image` filter and the chain it sits in move to the plugin unchanged — an author's
  explicit `.ogImage()` choice, then a subscriber's image, then the entry's `.featured()` photo, then
  the site default, in that order however the `plugins` array is written. `@plumix/plugin-og`
  contributes one link of it and now needs `@plumix/plugin-seo` installed to reach a page's head.

  The site-wide indexing toggle and the default social image move out of core's Site identity settings
  into the plugin's own group. A site upgrading keeps both answers with no migration step: the plugin
  reads its group first and falls back to the legacy `site.public` and `site.default_og_image` rows,
  and the settings form is seeded from the same fallback so the next save writes them through.

  Fixes a latent crash the move surfaced: `applyFilter` isolates each handler by structured-cloning
  the value, which throws outright on a payload carrying a function. A document manifest carries one
  whenever a theme writes `titleTemplate` as a callback, so any `render:document` subscriber took the
  page down on such a theme — nothing had one until now. A payload that cannot be cloned is handed
  over as it stands; isolation is what it loses, not the render.

  Core also gains two exports and one filter argument. `canonicalUrl` names the page the same way
  core's own redirect does. `loadSettingsGroups` reads any settings group through the request memo
  the template dep already uses, so a plugin joins that read instead of querying the table itself.
  And `render:document` now receives the title core resolved for the page — an entry's expanded
  title, an archive's label, a plugin archive's own — which a subscriber cannot derive, since the
  per-page-kind logic is core's and a `registerArchiveType` title is known only to the resolver that
  returned it. The argument is additive: an existing three-parameter subscriber is unaffected.

- [#2049](https://github.com/withplumix/plumix/pull/2049) [`9967c91`](https://github.com/withplumix/plumix/commit/9967c91f3406290fe8ebab250fbd2cf3da008e1e) Thanks [@nasyrov](https://github.com/nasyrov)! - Emits a cross-referenced JSON-LD graph and breadcrumbs.

  Every indexable page now carries one `<script type="application/ld+json">` holding a graph rather
  than a flat object: `WebSite`, the `Organization` or `Person` the site represents, `WebPage`,
  `Article`, `BreadcrumbList`, `ImageObject` and the author `Person`, each addressable by a URL
  fragment and referencing the others by `@id` instead of repeating them. Identifiers derive from the
  site root and the page's canonical URL, so two renders of one URL produce the same graph. A page
  that is not an entry carries the site-level pieces without the article ones, and a piece with
  nothing to say is absent rather than empty — a page with no social image has no `ImageObject` and
  no `primaryImageOfPage` pointing at one.

  **A page marked `noindex` emits no graph.** Structured data exists to make a page eligible for a
  rich result and a page asking not to be indexed is not, so advertising one anyway would have the
  page's graph and its robots directive say different things about it.

  Three filters, matching the granularity the mature implementations settled on:

  ```ts
  ctx.addFilter("seo:schema:needs", (needed, piece) =>
    piece === "breadcrumb" ? false : needed,
  );
  ctx.addFilter("seo:schema:piece", (piece, name) =>
    name === "publisher" ? { ...piece, sameAs: ["…"] } : piece,
  );
  ctx.addFilter("seo:schema:graph", (graph) => [...graph, myProductNode]);
  ```

  **Breadcrumbs ship as data and as a component.** `Breadcrumbs` renders the trail a theme puts in
  the page, and the `BreadcrumbList` in the graph is built from the same `breadcrumbTrail`, so what a
  reader sees and what a search result claims cannot disagree. The trail is Home → the entry type's
  archive, where it has one → the page itself, with the last step unlinked. Ancestors are not walked:
  a hierarchical entry's parents and a nested term's parents would each cost a per-render round-trip.

  **An editor can pick the type.** A new **Content type** field on the entry box retypes the article
  piece — `Article`, `BlogPosting`, `NewsArticle` or `TechArticle` — keeping its `@id` and every
  reference to it. A stored value outside the roster is not an answer. The field is on the entry box
  only: a term page has no article piece for the choice to retype. A new **This site represents**
  setting types the publisher piece as an `Organization` or a `Person`.

  The plugin serializes the script itself. `<`, `>`, `&` and the U+2028 / U+2029 line separators
  become `\uXXXX` escapes — the same string to a JSON reader, inert to an HTML tokenizer — so an
  entry titled `</script><script>…` cannot close the element it sits in. This is deliberately not
  core's job: core has no Content-Security-Policy, so there is no hash to register and no reason for
  core to hold structured-data vocabulary. `serializeJsonLd` is exported for a plugin emitting a
  script of its own. A theme that declared its own `application/ld+json` keeps it and this plugin
  emits none.

  The graph's `ImageObject` is the page's own image — an entry's explicit choice, a generated card or
  its featured photo — and never the site-wide default. That last link of the `og:image` chain is a
  sharing fallback, so passing it on would have every article claim the same bytes as its own
  `#primaryimage`, and `Article.image` is read as representative of the article it hangs off. The
  page is still shared with it; it is just not what the page is a picture of.

  Core additionally exports `archiveSlugForEntryType`, joining the reverse-routing vocabulary
  (`buildEntryPermalink`, `buildTermArchiveUrl`, `exposesHierarchicalUrls`) a plugin addressing the
  URL space the router compiled already reads. It answers the second half of the router's own test —
  the plugin asks the first half, whether the type is public, before calling it — so a breadcrumb
  never links an archive that has no route.

- [#2052](https://github.com/withplumix/plumix/pull/2052) [`928616d`](https://github.com/withplumix/plumix/commit/928616d730d4d561e30bafd8178be67499425a1f) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds sitemap images, a browser-readable sitemap, AI-crawler rules, `llms.txt` and IndexNow.

  **Images in the sitemap.** An entry's pictures ride its `<url>` as image entries, so image search finds
  them without crawling the page for `<img>` tags. They are the media fields the entry type tagged
  `.featured()` or `.ogImage()` — the declarations the social-image chain already reads — plus the
  social image URL an editor typed into the SEO box, which leads because it is the one they chose. A
  whole page of entries resolves through one batched pass rather than a query each, and only for types
  that declare such a field. Only images are listed and at most ten per URL, since a role-tagged field
  can be a `.multiple()` gallery; a URL that resolves relative — the worker-proxied path a private
  bucket hands back — is made absolute, because `<image:loc>` has to be. An entry with no picture
  serializes exactly as before, and a page with none declares no image namespace at all.

  **A stylesheet on the sitemap.** Every sitemap document names `/sitemap.xsl`. A crawler ignores the
  instruction and parses the same XML; a browser renders a table of URLs, last-modified stamps and
  picture counts. The stylesheet is inline and static, so nothing it renders needs a second request.

  **AI-crawler rules.** **Block AI crawlers** adds one `robots.txt` group naming the crawlers that feed
  model training and assistant answers — `GPTBot`, `ClaudeBot`, `Google-Extended`, `PerplexityBot` and
  a couple of dozen more — and disallows them everything. Ordinary search crawlers are untouched:
  holding those out is what the indexing toggle does. A site already held out of the index says nothing
  extra, since its allow-none rule covers every agent.

  **`llms.txt`.** The llmstxt.org convention: the site name, its tagline and a link to the sitemap,
  adjustable through a new `seo:llms-txt` filter. The map is offered only to a site that wants to be
  read this way — one held out of the index has nothing to offer, and one blocking AI crawlers has
  already said the opposite — so both get the heading and a sentence instead. The file is served
  either way, since a 404 reads as "not implemented yet".

  **IndexNow.** Setting a key turns on notification: publishing or updating an entry submits its URL to
  the shared endpoint, which fans out to every participating engine, so a change is picked up in
  minutes rather than at the next crawl. The key is served at `/indexnow-key.txt`, which the submission
  names as its `keyLocation` — a fixed path rather than `<key>.txt`, because the key is a runtime answer
  and routes are claimed at boot.

  Notification is safe by default. Every gate the head and the sitemap apply is applied here too, so a
  draft, a hidden entry, a non-public type and a private site are never submitted. One publish is one
  submission — `entry.update` fires both `entry:updated` and `entry:published`, so the submission is
  memoized per entry for the request. It is deferred past the response and swallows every failure into
  a log line: an unreachable endpoint, a timeout or a refused key is a missed notification, not a
  failed publish. Removals are not notified — a trashed entry drops out of the sitemap and is
  recrawled on the engine's own schedule. Nothing is submitted until a key is set.

  `renderSitemapIndex` and `renderSubSitemap` now take the stylesheet href as a second argument.

- [#2047](https://github.com/withplumix/plumix/pull/2047) [`6e0f239`](https://github.com/withplumix/plumix/commit/6e0f2394a08dd7c961c0be6b3b593884aaedf624) Thanks [@nasyrov](https://github.com/nasyrov)! - **Breaking.** Core no longer serves `/robots.txt` or the sitemap. Both come from
  `@plumix/plugin-seo` now, through the public-route seam, and core's SEO folder is down to the
  canonical URL and its tag. Install the plugin and add it to the config to keep them:

  ```ts
  import { seo } from "@plumix/plugin-seo";

  export default plumix({ plugins: [seo()] });
  ```

  The sitemap keeps its shape — an index plus one paged sub-sitemap per public entry type, taxonomy
  and registered archive, published entries only, with `seo:sitemap:urls` intact so a plugin can still
  inject rows. `seo:robots-txt` moves across unchanged. Both filters are this plugin's augmentation
  now, reached through the single `plumix` specifier, so core keeps no search-engine vocabulary; so is
  `sitemap` on `registerArchiveType`, which gains a `tags` field naming the cache tags its pages store
  under.

  **Routes are enumerated, not matched.** A registered public route has no fall-through, so the plugin
  claims `/sitemap.xml` and one `/sitemap-<scope>-:page([1-9]\d*).xml` per registered scope rather
  than one pattern over the whole `sitemap-*.xml` space, which would answer for scopes that do not
  exist and shadow anything else wanting a path in it. Two consequences a reader should expect: an
  unregistered scope (`/sitemap-nope-1.xml`) is a 404 where core answered with an empty `<urlset>`,
  and page `0` (`/sitemap-post-0.xml`) is a 404 where core computed a negative SQL offset from it.

  **Caching is the shipped edge cache now.** Core's bespoke scheme — a version token in the `settings`
  table mirrored into a Cache-API pointer — is deleted rather than moved, along with the subscriber
  that bumped it on every entry and term mutation. Sitemap responses declare
  `public, max-age=0, s-maxage=3600` and store under per-scope tags instead, so publishing an entry
  retires that scope and leaves the others alone where a version bump retired the whole set. Saving
  the settings group purges all of them, since the indexing toggle decides whether any of them have
  URLs at all. With no edge cache configured the sitemap generates per request, which is exactly the
  old no-cache fallback.

  Precision has one cost worth naming. A scope with no tags to contribute — a taxonomy registered
  with no `entryTypes`, or an archive whose `sitemap` omits `tags` — rides the one-hour window rather
  than a purge, where the version bump retired it along with everything else. Core's page cache
  already stores such a term archive untagged, so the sitemap now matches the page it points at.

  The indexing toggle that moved into this plugin's settings group reaches `robots.txt` and the
  sitemap, which read `seo.indexable` and fall back to the legacy `site.public` row — so a site that
  had disabled indexing keeps both behaviours with no migration step. `@plumix/plugin-feeds` still
  gates on `site.public` directly; syndication is not an indexing decision, and nothing in this
  release changes that.

  The canonical normalizer no longer names `/robots.txt` as a literal exemption. It is exempt as a
  registered public route, and by the dotted-last-segment rule whether or not a plugin claimed it —
  core spells no SEO path of its own.

  Core gains one export the sitemap needs: `buildTermArchiveUrl`, the async term-archive permalink
  builder that walks a nested term's ancestor chain. A sitemap that composed term URLs itself would
  drift from the archives it points at the first time a rewrite option moved one.

- [#2053](https://github.com/withplumix/plumix/pull/2053) [`d3d550c`](https://github.com/withplumix/plumix/commit/d3d550c4b87405d1c26e8e78c4adbda229d2727c) Thanks [@nasyrov](https://github.com/nasyrov)! - Gives the SEO plugin the two surfaces a person actually touches: a live search-result preview in
  the editor, and the rest of the settings screen.

  **In the editor**, the **Search & social** box on an entry now leads with a preview of the search
  result it will produce — the URL, the resolved title and the resolved description, each through the
  function the head runs, so the preview cannot show what the page will not carry. It updates as the
  author types, because the search title, the search description and the **Hide from search engines**
  toggle are read off the live form rather than off the saved row. Two length indicators track the
  resolved lines against 60 characters for the title and 155 for the description and say when one
  will be cut short. When the page is not offered to search engines the preview names the assertion
  that fired — the whole site, this entry, the content type, the taxonomy, a search-results page,
  page two of an archive, a page that was not found — which is what the reason string on the
  indexability predicate was built to carry. A term's box has no preview: it is written from an
  entry's permalink and excerpt, and a term archive has neither.

  The preview is a registered field type, so it reaches the editor through the plugin's own admin
  chunk. That is also why it is the one part of the plugin with Playwright coverage: the dispatcher
  harness cannot render a React control.

  **In settings**, the **SEO** page now composes three groups rather than one, each with its own Save
  and each gated by `settings:manage`:

  - **Search & social** — everything the site answers about its own content, as before.
  - **Site verification** — Google, Bing, Yandex, Baidu and Pinterest tokens, each reaching the head
    of every page under the meta name that engine reads.
  - **robots.txt** — hand-written content replacing the generated _rules_, so a rule can change
    without a deploy. The two site-wide answers compose around it rather than being replaced by it: a
    site with indexing turned off still disallows everything whatever the box holds, the AI-crawler
    group is still added while that toggle is on, and the `Sitemap:` line is still appended unless the
    author wrote one. The generated body carries that line too, which it did not before.

  Saving any of the three now purges the cached sitemap set _and_ the cached content pages of every
  registered entry type. Between them these groups rewrite a page's robots directive, title and
  verification tags, and the shipped cache has no site-wide tag to retire them by.

  `@plumix/admin` gains one thing on the plugin field-renderer contract: `siblings`, the other values
  in the bag the field's box binds to, as react-hook-form holds them. A control that describes the
  fields around it had no way to see them — `attrs` covers the block inspector only. Only the plugin
  branch subscribes, so a box of built-in inputs still re-renders one field per keystroke; a plugin
  control on an entry does re-render on any meta edit, since `meta` is one bag shared by every box on
  the entity.

  One bug fix comes with it. `plumix` builds the admin manifest at config time and never fired
  `theme:ready`, so anything a plugin registers from that handover was in the running worker's
  registry and missing from the admin's — which covered the SEO meta box and, since the settings
  groups moved there too, the whole SEO settings page. The manifest build now makes the same handover
  `buildApp` does.

- [#2050](https://github.com/withplumix/plumix/pull/2050) [`fed1b0d`](https://github.com/withplumix/plumix/commit/fed1b0d8ae49cb66fdac268c29cb4067750acd66) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds per-entry-type title patterns and completes the robots decision chain.

  **Title patterns.** A pattern is a line with `%%variables%%` in it, resolved per page: `%%title%%`,
  `%%sitename%%`, `%%sep%%`, `%%term%%`, `%%author%%`, `%%date%%`, `%%searchphrase%%` and
  `%%count%%`. Set one per entry type and every entry of that type is titled consistently; set the
  site-wide default and it covers every page no per-type pattern does — term, author, date and search
  archives included. An entry's own search title outranks both.

  A variable the page has nothing for resolves to empty, and a separator left holding nothing
  together is trimmed away, so `%%term%% %%sep%% %%sitename%%` ships as `Demo` rather than `· Demo`
  on a page with no term. A name that is not a variable is dropped rather than emitted — shipping
  `%%titel%%` into a search result is worse than shipping a shorter title.

  When a pattern or a search title composes the title, the plugin now ships it verbatim rather than
  letting a theme's `titleTemplate` append the site name a second time. A page with no pattern and no
  override still sets no title at all and keeps whatever the theme composed.

  **The full chain.** Indexability is decided by an ordered set of named assertions, short-circuiting
  on the first that fires: `site_private`, `entry_override`, `type_default`, `taxonomy_default`,
  `search_results`, `paginated`, `not_found`, then `default`. Four of those are new. A site owner
  gains per-entry-type and per-taxonomy indexing defaults, so a whole class of content leaves the
  index and the sitemap at once, and paginated archives, search results and pages that were not found
  are held out by default with a toggle each.

  The sitemap agrees across all of it: a scope whose type or taxonomy is held out is absent from the
  index and serves an empty `<urlset>`. The three arms below `taxonomy_default` describe pages the
  sitemap never lists.

  **Settings are enumerated from the registry.** The group now carries a title separator, a default
  pattern, the three thin-page toggles, and one pattern plus one indexing toggle per public entry
  type and taxonomy — registered at `theme:ready`, so a type any plugin registers during `setup` gets
  its fields. Two things are out of scope by construction: a type registered from a `theme:ready`
  handler that runs after this plugin's is too late to be enumerated, and a name that is not
  `[a-zA-Z0-9_-]+` cannot be a settings field key, so it gets no per-type fields rather than failing
  the boot — core validates neither entry-type nor taxonomy names.

  Two behaviours worth naming, both on error pages, which reach this plugin's head for the first time.
  They no longer declare a canonical URL or an `og:url` — a URL that resolved to nothing is the
  canonical address of nothing, and core leaves an error page's canonical unwritten for the same
  reason. They do now carry the rest of the set, so a shared broken link unfurls with the site's name,
  tagline and default social image rather than nothing; the `<title>` core gives them (`Not Found`)
  is not localized, which is unchanged but now also reaches `og:title`.

### Patch Changes

- [#2054](https://github.com/withplumix/plumix/pull/2054) [`f28dfe3`](https://github.com/withplumix/plumix/commit/f28dfe3fa0012e26ddb68a63405b3321bd7b85c9) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `previewableEntry`, so a plugin building an editor-side preview does not hand-roll its own
  authorization gate. It loads an entry by id, rejects a type outside the calling procedure's
  allowlist as `NOT_FOUND`, gates on `edit_any` or author-plus-`edit_own`, and overlays the caller's
  pending autosave onto the row's content, excerpt and meta.

  The gate is the editor's own rather than the read gate a published entry would pass for anyone,
  because a preview carries the entry's title and excerpt and a draft's are not public yet. The
  allowlist is load-bearing: unlike `entry.get`, the gate does not re-check `read` or reject reserved
  types, so a caller must pass its own registered types rather than a wide or user-supplied list.

  `@plumix/plugin-og` and `@plumix/plugin-seo` now share this one implementation instead of carrying
  a copy each. Neither plugin's behaviour changes.
