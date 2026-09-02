# plumix

## 0.20.0

### Minor Changes

- [#2137](https://github.com/withplumix/plumix/pull/2137) [`15b7cc9`](https://github.com/withplumix/plumix/commit/15b7cc993bb94b9e4ee9c7eb1223efa049225f29) Thanks [@nasyrov](https://github.com/nasyrov)! - Blocks now declare which of their inputs carry text and whether each holds HTML, and one walk extracts an entry's plain text from that roster — nested slots included, tags stripped, entities decoded. `extractBlockText` returns the text; `blockTextVersion` hashes the merged roster, so a block that adds or changes a declaration invalidates whatever was derived from the old one without an author maintaining a version number.

  `countProse` is now a filter over the same walk and takes the roster as a second argument: `countProse(blocks, blockTextRoster(coreBlocks))`. It keeps reading only the inputs declared as body copy, so reading-length estimates are unchanged — a code listing, a control's label, an image's alt text and a caption are findable but are not read at prose speed.

- [#2139](https://github.com/withplumix/plumix/pull/2139) [`f8f2d9d`](https://github.com/withplumix/plumix/commit/f8f2d9d128da81db7383e15b550232196a4bcc95) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an entry change feed — a durable record of which entries changed.

  Nothing recorded which entries had changed. A consumer that needs to know could only subscribe to
  the `entry:*` lifecycle actions, which miss every write that bypasses the application: seeds,
  migrations, direct-write tooling, bulk imports. An `entry_changes` table now carries one row per
  change, appended by triggers on `entries` so no writer can bypass it. Only a change to title,
  content, excerpt or status enqueues, so a metadata-only save records nothing; a deletion enqueues a
  tombstone, because the entry it names is gone by the time a consumer reads it.

  `readEntryChanges(db, limit)` returns the oldest pending changes and `ackEntryChanges(db, changes)`
  drops the ones a consumer has finished with. Both accesses are primary-key ordered, so draining
  tracks the batch rather than the corpus, and acknowledging after the work rather than before leaves
  an isolate that dies mid-drain its batch for the next one. Nothing in core drains the feed yet —
  the first consumer is the search plugin.

  `plumix migrate generate` emits core's DDL ahead of every plugin's, since the objects it creates sit
  on core's own tables. The demo sandbox's statement splitter now keeps a trigger body whole: it split
  on every semicolon outside a quoted span, which would have cut the first trigger to reach it into
  fragments.

- [#2156](https://github.com/withplumix/plumix/pull/2156) [`ef34a26`](https://github.com/withplumix/plumix/commit/ef34a26b1ae0e6892cdd694bc9507f63f5a2f3d6) Thanks [@nasyrov](https://github.com/nasyrov)! - Lets a plugin-registered archive state which page of results it is, and which query it answers.

  Installing `@plumix/plugin-search` offered every search-results page to crawlers on a site that had
  never asked for that. The plugin replaces core's `/search` with its own archive, which renders as
  `kind: "custom"`, and two of `@plumix/plugin-seo`'s assertions keyed on facts core's payload carried
  and a plugin's could not: `search_results` fired on `kind === "search"`, and `paginated` read a page
  index a plugin archive always reported as 1. Both arms went quiet, and the pages came out indexable.

  `CustomArchiveData` now carries two optional facts an archive states about itself — `page`, the
  1-based pagination index, and `query`, what the visitor typed on an archive that answers a search.
  `PageFacts` reports both, so seo keeps making the decision and core keeps stating facts, the split
  ADR 0002 drew. The `paginated` arm now works for every plugin archive that paginates rather than for
  none of them, and an archive that states neither fact is untouched.

  The alternative was for seo to recognise the archive by name. That would have put one plugin's
  identity inside another plugin's conditional, and it would have fixed `search_results` while leaving
  `paginated` broken for every plugin archive rather than just this one.

  Nothing changes for a site running one plugin or the other alone, and turning **Index search-results
  pages** on offers the plugin's page exactly as it offers core's.

- [#2138](https://github.com/withplumix/plumix/pull/2138) [`ea3064e`](https://github.com/withplumix/plumix/commit/ea3064e633da292ea74b0f384e2373775852b255) Thanks [@nasyrov](https://github.com/nasyrov)! - Lets a plugin contribute raw SQL migrations that drizzle-kit cannot express.

  `plumix migrate generate` shells out to drizzle-kit, which models tables, columns and indexes and
  nothing else. A virtual table or a trigger had no route into the generated set: a hand-written file
  dropped into `drizzle/` is invisible to drizzle's journal, so the next generate reuses the same
  index and which of the two `wrangler d1 migrations apply` runs first becomes filename luck.

  A plugin descriptor now takes `sqlMigrations` — a name and the statements to run. Generation emits
  each one as its own file after the schema diff, so the DDL lands behind the tables it references,
  and appends a journal entry so drizzle-kit numbers its next migration past it. That entry carries
  no snapshot of its own, which drizzle-kit tolerates: it skips the index and diffs against the
  previous snapshot, correct here because raw DDL touches only objects drizzle does not model. A name
  is the migration's identity, so one already in the journal is never emitted twice — renaming it
  emits it again rather than editing what has already reached a database.

- [#2154](https://github.com/withplumix/plumix/pull/2154) [`9bb2509`](https://github.com/withplumix/plumix/commit/9bb250923e5b65f77a03986e65451aab497baa64) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `.searchable()` to the meta-field builders, so structured data an entry stores in its meta bag
  can be found from the site's search page.

  Default-deny, the way `.showInApi()` is. Meta holds plugin bookkeeping and internal keys at least as
  often as it holds prose, and indexing all of it is the mistake ElasticPress spent a decade on before
  reversing it — the same failure this epic already fixed for entry content. Nothing about an existing
  site's index changes until a field asks.

  The chain is offered on the text-shaped builders — `text`, `textarea`, `email`, `url` and `richtext`,
  whose stored document is flattened to its prose. A capability-gated field is never indexed whatever
  it declared, and neither is a `password` field: a snippet is body text around a word the visitor
  chose, so a value not everyone may read cannot be in the document at all. That is the same rule that
  keeps an access-gated entry type out of the projection entirely.

  Marking an existing field searchable needs nothing else. The extractor version now hashes the field
  roster beside the block roster, so every affected document is stale from that moment and the
  scheduled run re-projects them — no version to bump, no entry to re-save.

  **Core.** `entries.meta` joins the change feed's watched columns, so a meta write reaches a consumer's
  projection the way a title edit does — including one made by a seed, a migration or a direct write.
  That arrives as a raw SQL migration: run `plumix migrate generate` and apply it after upgrading.

- [#2155](https://github.com/withplumix/plumix/pull/2155) [`446a735`](https://github.com/withplumix/plumix/commit/446a7353edce4ec0f4576c0401a3f548623142c7) Thanks [@nasyrov](https://github.com/nasyrov)! - Ranks the admin command palette's Content results out of the search index, so the entry an editor
  wants is near the top rather than merely the one edited most recently — and a word from the middle of
  an entry's body finds it, which a palette matching titles and excerpts could not do.

  Nothing is configured, and nothing switches over. Core's handler stays registered, and two handlers
  sharing a group now fill it between them: the ranked matches lead and core's title-and-excerpt matches
  fill whatever is left. That is the whole of the degrading story. Whatever the index cannot answer,
  core still does — a type under an access policy, which is never indexed; an entry not yet projected on
  a site that has installed the plugin but not rebuilt; every type at all before the index exists; and a
  half-typed word, since the index matches whole terms. A missing index degrades quietly here rather
  than saying so the way the search page does — a palette that logged would log once per keystroke, and
  both the page and the scheduled run already tell an operator. The cost is that both queries run on
  every keystroke, which is what buys the seamlessness.

  Excluding an entry type from search now bounds a visitor rather than an editor. Such a type is
  projected and ranked in the palette, and the search page's own clamp is what keeps it out of results,
  so a navigation-menu entry stays findable where an editor has to find it. A type under an access
  policy is still kept out of the projection altogether. A site with one of these types sees it in the
  palette once the entry is next saved, or after a rebuild.

  The ranked half of the palette answers only for entry types the caller can **edit**. A ranked result
  is a body-text match, so answering one says a word appears somewhere inside an entry — and
  `entry:<type>:read` bottoms out at the subscriber tier, which on a site with open signup every reader
  holds for every registered type. Core's title-and-excerpt handler still answers those.

  `-word` now excludes rather than being swallowed, on the search page as well as in the palette. Quoting
  every token left the hyphen inside the phrase, where FTS5's tokenizer drops it — so `report -draft`
  asked for exactly the drafts it ruled out. A query of nothing but exclusions returns nothing: FTS5
  cannot spell "every document except these", and the whole corpus is not what anyone meant. A hyphen
  inside a quoted phrase is still part of the phrase.

  **Core.** `adminEntryScope` is now exported: which palette group a caller may be shown per entry type,
  the clause bounding which of their rows they may see, and the bucketing that turns matched rows into
  groups. Both handlers build on it, so "who may see which draft" and "what a group is called" each have
  one definition, and an author still sees their own drafts and nobody else's. It takes a reach — `read`
  for a surface showing titles, `edit` for one showing more than that. The `admin:search:results` types
  are exported with it.

- [#2145](https://github.com/withplumix/plumix/pull/2145) [`3ce10d1`](https://github.com/withplumix/plumix/commit/3ce10d14664e1c6a2e5e8ae7490cb3c3947463c4) Thanks [@nasyrov](https://github.com/nasyrov)! - Gives the search index a query surface: `/search/<query>` now returns ranked results with highlighted
  snippets.

  `@plumix/plugin-search` claims core's search patterns at a priority that sorts ahead of them, so
  installing it upgrades the existing search page in place and uninstalling it restores core's with
  nothing to undo. Results are ordered by weighted bm25 — a title match counts for ten times a body
  match — and each carries `kind`, `id`, `title`, `url`, `snippet` and `score`, templated through
  `forArchiveType("search")`.

  A snippet arrives escaped. FTS5 splices its highlight markers into indexed content without escaping
  anything around them, so a snippet rendered as HTML would run whatever script an author had written
  as text; everything but the `<mark>` is turned into entities first.

  A query is treated as words to look for rather than as an expression: adding a word narrows the
  results, a quoted phrase matches exactly, and every FTS5 operator is inert. Any string a visitor can
  type compiles to a valid search, so an unbalanced quote returns an empty page rather than an error.

  Only published entries appear, and an entry type under an access policy is never indexed at all — a
  snippet is body text around a word the visitor chose, so indexing a gated type would hand an
  anonymous reader its prose a query at a time. Keeping it out of the projection is what makes that
  impossible rather than dependent on a predicate. The page is not edge-cached, for the reason core
  gives for leaving its own out: an unbounded query space would mint a cache entry per distinct
  string.

  The ranking algorithm is named in configuration — `search({ ranking: "bm25-v1" })` — even though its
  weights are hardcoded. A site that has named the algorithm it is on keeps its result order when a
  better one ships; retrofitting a name onto implicit behaviour is what cannot be done afterwards.

  **Core.** Two rules could never claim one route pattern, which made the documented "a rule numbered
  below 5 lands ahead of the framework routes" impossible to use on a framework route: the collision
  fired before priority was consulted. A rule may now claim a framework pattern when its priority
  actually beats the framework's. Everything the check was built to catch still throws — two plugins
  colliding, and a rule claiming a framework pattern at a priority that cannot win, which would
  otherwise never match and say nothing about it. `escapeHtml` and the framework search patterns are
  now exported, so a plugin replacing the search page addresses the URL space core compiled rather than
  a near-miss of it.

- [#2150](https://github.com/withplumix/plumix/pull/2150) [`5d53a81`](https://github.com/withplumix/plumix/commit/5d53a81b2e33f9e29c11459012c1d11b5c738a5e) Thanks [@nasyrov](https://github.com/nasyrov)! - Indexes terms beside entries, so a visitor searching a topic's name reaches the topic rather than
  only the articles about it.

  Both go in the same index behind the source discriminator and come back in one ranked list. Two
  queries merged would be putting bm25 scores side by side that were computed against different
  corpora, and it forces offset pagination on the merge. A result says which it is, so a theme can
  render a topic and an article differently.

  A term contributes its name and the description its archive carries. A result carries the archive URL,
  built through the same reverse routing core uses, so a hierarchical taxonomy resolves its ancestors.

  Terms have no change feed — core's records entries — so they are indexed through the lifecycle
  actions, and a term the projection has never held is swept up by the scheduled run, bounded per
  invocation. That sweep is what reaches the categories a site already had; without it, installing the
  plugin on an existing site would leave every one of them unfindable until it was next edited. A term
  written straight to the database after that waits for the same sweep rather than appearing at once.

  One limit is by design: the recency plan is entries-only, because a term has no publication date to be
  ordered by — so a word common enough to reach that plan is answered with articles.

  `SearchResult.id` is unique only within a `kind`. A theme keying a list on it alone will collide once
  a page holds both an entry and a term with the same id.

  **Core.** A term taxonomy can now be excluded from public search, `excludeFromSearch`, defaulting from
  its public flag exactly as the entry-type equivalent does. A navigation-menu taxonomy is not public,
  so its terms stay out of results with nothing else declared — which had to land before terms became
  searchable at all. The admin command palette ignores the switch: an editor searches what they can
  read, not what a visitor can.

- [#2134](https://github.com/withplumix/plumix/pull/2134) [`511aa60`](https://github.com/withplumix/plumix/commit/511aa60bbc207c864093df16a518ba7b97eb2712) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds a third argument to `applyTestSchema` from `plumix/test` for raw SQL statements that run after the compiled drizzle schema, so a suite can set up the triggers and virtual tables drizzle cannot express and test against the schema production actually has. Pass one statement per array entry.

### Patch Changes

- Updated dependencies [[`15b7cc9`](https://github.com/withplumix/plumix/commit/15b7cc993bb94b9e4ee9c7eb1223efa049225f29), [`6848efd`](https://github.com/withplumix/plumix/commit/6848efd2ebdcffa771ffad4238e46d869dd55664), [`155123e`](https://github.com/withplumix/plumix/commit/155123eddb77981d3391f60957d312950515f5af), [`f8f2d9d`](https://github.com/withplumix/plumix/commit/f8f2d9d128da81db7383e15b550232196a4bcc95), [`36723db`](https://github.com/withplumix/plumix/commit/36723db2903a0156a12b598a62755d2d5cf25e41), [`ef34a26`](https://github.com/withplumix/plumix/commit/ef34a26b1ae0e6892cdd694bc9507f63f5a2f3d6), [`ea3064e`](https://github.com/withplumix/plumix/commit/ea3064e633da292ea74b0f384e2373775852b255), [`823aab7`](https://github.com/withplumix/plumix/commit/823aab7e431fffa67001e7e4b8cbb2f32683e9f3), [`ee5d2b7`](https://github.com/withplumix/plumix/commit/ee5d2b74765a7d2b0931aecbc5805cbe6ef58ff4), [`9bb2509`](https://github.com/withplumix/plumix/commit/9bb250923e5b65f77a03986e65451aab497baa64), [`446a735`](https://github.com/withplumix/plumix/commit/446a7353edce4ec0f4576c0401a3f548623142c7), [`3ce10d1`](https://github.com/withplumix/plumix/commit/3ce10d14664e1c6a2e5e8ae7490cb3c3947463c4), [`5d53a81`](https://github.com/withplumix/plumix/commit/5d53a81b2e33f9e29c11459012c1d11b5c738a5e), [`511aa60`](https://github.com/withplumix/plumix/commit/511aa60bbc207c864093df16a518ba7b97eb2712)]:
  - @plumix/blocks@0.20.0
  - @plumix/core@0.20.0
  - @plumix/admin@0.20.0
  - @plumix/admin-ui@0.20.0
  - @plumix/admin-editor@0.20.0

## 0.19.0

### Minor Changes

- [#2113](https://github.com/withplumix/plumix/pull/2113) [`b88e2f3`](https://github.com/withplumix/plumix/commit/b88e2f39608fd6b7f68d40ef989bd9d55f655a73) Thanks [@nasyrov](https://github.com/nasyrov)! - Stops `plumix migrate generate` reporting success over migrations it never wrote, and wipes the
  generated `drizzle/` before an e2e run regenerates it.

  drizzle-kit catches its own generate errors, prints them, and exits 0. The CLI already refused a
  non-zero exit, but that code never came, so a failed generate still printed `✓ Migrations emitted`
  and left the previous run's SQL in place. The command now reads what drizzle-kit put on stderr —
  empty on success, including a generate that finds nothing to do — and fails with
  `migrate_generate_failed` when there is any. Because stderr is now the signal, drizzle-kit runs
  under `--no-warnings`, so Node's own deprecation notices cannot be mistaken for one.
  `spawnCapturingStderr` is the new `@plumix/core` seam behind it: `spawnInherit` with stderr teed
  rather than inherited, so the child's output still reaches the terminal as it arrives.

  The failure it was hiding: the worker-driven e2e command baked by `definePlumixE2EConfig` wiped
  `.wrangler/state` but not `drizzle/`. That directory is gitignored and regenerated from the current
  schema every run, so one left over from an earlier run is output from an older schema — which
  drizzle-kit will not replace without being told how to resolve the rename. `wrangler d1 migrations
apply` then builds a database missing whatever the schema added since, and the suite fails much
  later on the missing table. CI never saw it: a fresh checkout has no `drizzle/`, so there is nothing
  to diff against. The baked command now wipes it alongside the state it belongs to, which is what
  makes a repeat local run match the fresh checkout CI always gets.

- [#2086](https://github.com/withplumix/plumix/pull/2086) [`8aa171f`](https://github.com/withplumix/plumix/commit/8aa171f34e562f3a0176e802abaf63f5639002cc) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `.default()`, which narrowed the read type to a non-optional value while nothing supplied
  that value on read. `decodeMetaBag` walked only the keys storage held, so a declared default
  existed as a type and an admin form prefill and nowhere else — `text("tone").default("warm")` typed
  as `string` and read back `undefined` on any row saved before the field was added, or written
  through the RPC.

  The decoder now fills a declared default wherever the bag has no key. A repeater row and a group
  value are bags in their own right, and both builders permit arbitrary nesting, so decoding recurses
  and the fill reaches every depth `InferFields` claims. The value travels the same decode path a
  stored one does, so a `.returns("date")` default reads back a `Date`. Absence is the only trigger —
  storage cannot hold `undefined`, so a stored `null` is a value someone chose and keeps its place.
  An absent container stays absent rather than being synthesized from its members' defaults, which is
  what its own read type says.

  Making container decode recursive also fixes two adjacent gaps in the same read shape: a
  `.returns("date")` field nested in a group or a repeater row is now projected to a `Date` rather
  than left as its stored string, and a legacy reference value nested more than one level deep is now
  healed.

  `storedMeta` is untouched, which is the split that matters: `.whereMeta()` and the rule predicates
  compare against the stored bag, so a defaulted key still does not match until something saves it.
  A default is now visible on every read surface — templates, the admin RPC, and the REST API for a
  field that opted in with `.showInApi()`.

  `settings.get` fills its group's defaults too. Settings have no decode pass of their own, so that
  one is a fill and nothing more: a `.returns("date")` settings field still reads back its stored ISO
  string.

  A field key of `__proto__`, `constructor` or `prototype` is now rejected at registration for
  top-level meta fields, as it already was for repeater and group members. Such a key passed the key
  regex and then swapped the prototype of the decoded bag instead of storing a value.

  Internals: `decodeMetaBag` and `loadMeta` take a `MetaScope` — a field list paired with a lookup
  over it — since filling a default needs the fields storage never mentions. `metaScope(fields)`
  builds one and `metaScopeCache(listFields)` memoizes per scope key, so an archive resolves each
  entry type's field list once rather than once per row. `listTermMetaFields` and `listUserMetaFields`
  join the existing `listEntryMetaFields`.

- [#2057](https://github.com/withplumix/plumix/pull/2057) [`ad062d7`](https://github.com/withplumix/plumix/commit/ad062d71bce7201f4b9bef038f1d2837e4157ae2) Thanks [@nasyrov](https://github.com/nasyrov)! - Publishes `toMetaBoxFieldEntry`, and puts it on `plumix/fields` beside `compileMetaBoxFields` and
  the builders the pair operates on. Together they are the transform a `fields` array already goes
  through on its way to the admin, so a plugin that renders fields on a surface core does not runs
  them instead of reimplementing the projection.

  `compileMetaBoxFields` folds an array of fluent builders, plain definitions, or a mix of the two
  down to definitions — it was already on the root barrel and is now reachable from `plumix/fields`
  too. `toMetaBoxFieldEntry` is new: it projects one definition into the wire-shaped entry the
  renderer reads, recursing into repeater rows and group members, and dropping the `sanitize` and
  `validate` callbacks, which run on the server and have no serialisable stand-in. The types a
  renderer needs to name what it is handed — `FieldBuilder`, `MetaBoxField`, `MetaBoxFieldInput` and
  `MetaBoxFieldManifestEntry` — are published on `plumix/fields` alongside them.

  The pair is the transform only. Registration also validates: key shape, the reserved `__plumix_`
  prefix, duplicate keys, the per-box field cap, and `.visibleWhen()` rules naming a field the box
  declares. A caller projecting an array itself owns those checks.

  The per-field projection moves out of the build-time manifest projection into
  `plugin/fields/manifest-entry.ts`, so reaching for it no longer drags the block and registry graph
  behind it. Existing `@plumix/core/manifest` consumers are unaffected.

- [#2059](https://github.com/withplumix/plumix/pull/2059) [`d79b4b5`](https://github.com/withplumix/plumix/commit/d79b4b597a26dd073cc32a3e89a232c58173aab0) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `formPost: true` to `registerRoute`, so a public plugin route can accept a submission from a
  plain HTML form. Every path under `/_plumix/` sits behind a CSRF gate requiring the
  `X-Plumix-Request` header, and a browser cannot set a custom header on an ordinary form POST — so
  until now no plugin route could serve a no-JavaScript submit at all.

  The opt-in drops the header requirement and leaves the Origin check as the whole control: an exempt
  request has to carry an Origin (or Referer) matching the site, where an ordinary one is only
  rejected for contradicting it. It exempts the POST and nothing else — a route registered as
  `method: "*"` still gates every other write method — and never a path core answers itself, so a
  plugin id that happens to name one of core's own prefixes cannot drop the gate in front of a route
  it never serves. The same-origin and dev-loopback allowances are unchanged, and a
  route that did not take the opt-in is gated exactly as before — including a sibling route on the
  same plugin prefix.

  It is valid only on `auth: "public"`; taking it on an authenticated, capability-gated or dev-only
  route throws at registration. The reasoning is what the header gate defends: a cross-origin POST
  carrying ambient session authority. A public submission carries none, so an attacker forging one has
  merely submitted a form they could have submitted directly.

  That holds only while the handler never derives privilege from a session, so the dispatcher takes
  the session away rather than trust the handler to ignore it: on the exempt POST `ctx.authenticator`
  resolves nobody — `getContext()` included, so a hook listener the handler fires sees the same
  anonymous request — while a header-carrying POST to the same route keeps its session. Only the
  authenticator is swapped; the session cookie is still on `ctx.request`.

  Also fixes a latent bug this uncovered: the edge-cache purge accumulator keyed its pending tags on
  the `AppContext` object, so tags enqueued against a derived context (basePath stripping, `withUser`)
  were dropped by the flush, which runs against the outermost one. It now keys on the request memo,
  which is what `tagCacheEntry` already did for the same reason.

- [#2074](https://github.com/withplumix/plumix/pull/2074) [`3290448`](https://github.com/withplumix/plumix/commit/3290448915db0b8ee89528962a407c518c7bc29e) Thanks [@nasyrov](https://github.com/nasyrov)! - Publishes `entryTypeMatch`, `termTaxonomyMatch`, `metaEquals` and `termMetaEquals`, so a
  plugin-authored rule kind can mint a narrowing of its own the way core mints `named`.

  The five `*Targets` constructors publish the narrowings core already knows how to compare — `slug`,
  `id`, `where`, `whereMeta`, `archive`. A rule kind wanting one they do not publish, the way `named`
  is `templates`' own, needs the two pieces underneath them: the node prefix the narrowing hangs off
  and the predicate that goes inside it. Both were module-private, so core built `named` from one
  place while a third-party rule kind had to restate the matcher — the coupling the shared vocabulary
  exists to remove, which does not stop being one a level down.

  `entryTypeMatch` and `termTaxonomyMatch` now take a registered name rather than a `string`, so a
  narrowing of your own rejects a typo where a hand-written object literal would compile into a rule
  that never matches. Both are what the `*Targets` constructors already call, so what they mint is
  unchanged.

  `MatchNarrowing` — what a `*Match` constructor accepts on top of the prefix — is published with
  them, and reaches everything on the matcher except `nodeKind` and `type`: minting those from one
  place is the job, so overriding them is now a compile error rather than a quiet way back to a
  hand-written matcher.

  [Custom Rule Kinds](https://plumix.dev/themes/rule-kinds/) documents the four, including the one
  trap that remains: a predicate tests the data shape as well as the value, and nothing rejects an
  entry predicate on a term matcher.

- [#2081](https://github.com/withplumix/plumix/pull/2081) [`6825fbf`](https://github.com/withplumix/plumix/commit/6825fbfbbd2431e662a79af09165f323e9a8718f) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `ResolvedTerm.meta` on the public render path, which handed a template the raw meta JSON
  column while `ResolvedTermFor<K>` typed it as the decoded read shape `TermMetaOf<K>` describes. A
  `.returns("date")` term field typed as `Date` and arrived as the stored ISO string; a reference
  field typed as its hydrated summary and arrived as the stored id.

  Term meta now gets the same treatment entry meta does. `buildResolvedEntries` decodes and
  reference-hydrates the terms it attaches to each entry — batched, so the terms across a whole
  archive cost one in-query per `(kind, scope)` group rather than one per term — and a term archive
  resolved through `termData` does the same. `storedMeta` still carries the JSON column untouched, so `.whereMeta()`
  and `termMetaEquals` keep matching stored values; `meta` and `storedMeta` now differ on a term
  exactly as they already did on an entry.

  The types are unchanged — `ResolvedTerm.meta` was already `ResolvedMeta` and `ResolvedTermFor<K>`
  already folded to `TermMetaOf<K>`; only the runtime was behind. A theme that read `data.term.meta`
  expecting the raw column should read `data.term.storedMeta` instead.

  Note that `.default()` is unaffected on terms as on entries: it prefills the admin form and
  nothing applies it on read, so a defaulted key absent from storage still reads back `undefined`.

- [#2078](https://github.com/withplumix/plumix/pull/2078) [`421e39a`](https://github.com/withplumix/plumix/commit/421e39a62cd62a565e8424bb06d9d0289d69764c) Thanks [@nasyrov](https://github.com/nasyrov)! - Types `storedMeta` on a targeted rule's entry and term, so `.where()` reads the stored meta bag at
  the same shape `.whereMeta()` is checked against.

  `ResolvedEntryFor<K>` and `ResolvedTermFor<K>` — the projections behind `forEntryType(...).where()`
  and `forTermTaxonomy(...).where()` — folded `meta` to `MetaOf<K>` / `TermMetaOf<K>` and left
  `storedMeta` as the base bag. So the documented escape hatch — the comparison `.whereMeta()`'s `===`
  cannot express — handed back untyped values: `data.entry.storedMeta.filedOn` had no autocompletion
  and no error on a typo'd key, on the one bag whose shape the registry already knew. Both projections
  now fold it to `StoredMetaOf<K>` / `StoredTermMetaOf<K>`.

  `ResolvedEntry.storedMeta` and `ResolvedTerm.storedMeta` widen from `JsonObject` to the new
  `StoredMeta` (`Record<string, unknown>`), mirroring how `meta` is the open `ResolvedMeta` — a
  projection can only replace a base property with a narrower one if the base is open, and the folded
  stored shape is not `JsonObject`: a field left unmarked by `.required()` folds to `T | undefined`,
  and a `json()` or `richtext()` field to `unknown`. Where the fold is out of reach the values now
  read as `unknown` rather than `JsonValue`: an untargeted `ResolvedEntry`, and `data.entries[n]` in
  an archive or taxonomy rule, where a taxonomy spans entry types and there is no single shape to
  fold. `data.entry` and `data.term` on a targeted rule — where the fold is available — gain the
  field's real stored type.

- [#2062](https://github.com/withplumix/plumix/pull/2062) [`7b36faf`](https://github.com/withplumix/plumix/commit/7b36faf5b7a0a0bcc9f5db8a244464975a5ecd42) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `readVisitorMeta` to `plumix/db`: a request in, a salted per-install hash of the visitor's
  address and their truncated user-agent out. It is what a public submission handler needs to
  rate-limit or attribute without keeping the address itself, and `@plumix/plugin-comments` and
  `@plumix/plugin-forms` had each grown their own copy of it — the same hex encoder, the same lazily
  minted settings-row salt, the same `cf-connecting-ip` → `x-forwarded-for` → `"unknown"` ladder.

  The salt is minted on first use and persisted in the settings table, so an install needs no env var
  or KV binding to store hashed addresses; concurrent first-writes converge on one salt through
  `onConflictDoNothing` and a re-read. It takes the caller's namespace and keeps that namespace's salt
  in its own group, so no two callers share one — either's hashes would otherwise be matchable against
  the other's.

  To be clear about what the salt buys: it defeats a precomputed table of the IPv4 space and nothing
  more. It lives in the same database as the hashes, so it is no defence against someone who has
  already read that database.

  Also closes the hole that made keeping the salt off a settings _page_ meaningless. `settings.get`
  took any group name it was handed, so both plugins' salts were readable by anyone holding
  `settings:manage` — which is admin-wide, and mintable as a narrow API-token scope that has no
  business seeing them. A settings group whose name ends in `_internal` now means server-only rows:
  `settings.get` and `settings.upsert` refuse it, and `registerSettingsGroup` rejects the name at boot
  rather than letting a plugin build a settings page that fails on every load. Server-side readers are
  unchanged — this defends against a `settings:manage` holder, not against code running in the worker.

- [#2076](https://github.com/withplumix/plumix/pull/2076) [`022401e`](https://github.com/withplumix/plumix/commit/022401e1b77978bfe0d97cde5213609823f67329) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `.whereMeta()` on the template and rule-kind selectors, which typed its value against the
  stored meta shape and then compared it against the decoded one — so a narrowing on a
  `.returns("date")` field or a reference type-checked and never fired.

  `ResolvedEntry` and `ResolvedTerm` now carry `storedMeta` beside `meta`: the meta JSON as the row
  holds it, next to the decoded and reference-hydrated bag a template reads. `metaEquals` and
  `termMetaEquals` — and so `.whereMeta()` and `.named()`, which are built from them — compare
  against `storedMeta`. `.whereMeta("filedOn", "2026-01-01")` now matches the stored ISO string a
  `.returns("date")` field reads back as a `Date`, and `.whereMeta("subject", "42")` matches the
  stored id a reference reads back as a summary object.

  The types are unchanged: `StoredMetaOf<K>` / `StoredTermMetaOf<K>` were always what `whereMeta`
  addressed, and `===` has a primitive to land on there — a `Date` and a hydrated summary have no
  literal a caller could write down. A theme that worked around the old behaviour with `.where()`
  reading `data.entry.meta` still does; a hand-built `ResolvedEntry` (a preview fixture, a test
  double) has to add `storedMeta`.

- [#2063](https://github.com/withplumix/plumix/pull/2063) [`fa1a0d7`](https://github.com/withplumix/plumix/commit/fa1a0d7657060e61a3f17df133f6e5e38cbccad7) Thanks [@nasyrov](https://github.com/nasyrov)! - Widens a form's field roster to the v1 set and teaches it fields that only sometimes apply.

  Alongside `text` and `email`, a form now takes `textarea`, `url`, `number`, `date`, `select` and
  `toggle` from `plumix/fields`, plus `tel` from `@plumix/plugin-forms/fields`. Each renders the
  control its answer needs and stores that answer in the shape the field declares — a `number` as a
  number, a `toggle` as a boolean, a `select` as one of the options the form offered. An answer the
  visitor never gave is absent rather than empty — except from the two controls that always answer,
  where an unticked checkbox is `false` and an unmade multiple choice is an empty list. So
  `FormAnswersOf<typeof yourForm>` is what a submission actually holds, and renaming a field breaks
  the build at its readers rather than in production.

  `tel` is the plugin's own contribution to the field vocabulary rather than a core built-in: it
  registers through `registerFieldType` and ships the admin renderer for it, so a `tel` field works
  anywhere a field does, meta boxes included. Making that possible without restating core's whole
  string chain is the one change in core — `StringMetaBoxField` and `StringFieldBuilder` are no
  longer bound to the five built-in string inputs, so a plugin contributing a string-shaped input
  reuses both. The built-in roster is unchanged, and such a field lands in the union exactly where a
  plugin-registered type already did.

  A field can now name a condition on a sibling, exactly as it would in a meta box:

  ```ts
  const plan = select("plan").options(["basic", "pro"]);
  const signup = defineForm("signup", {
    fields: [plan, number("seats").visibleWhen(plan.is("pro"))],
  });
  ```

  Core's own `isFieldVisible` judges it on both sides, and both judge a bag built the same way, so an
  untouched form is read exactly as it was served: the markup leaves out a field the form's defaults
  hide, and the submit handler drops one the submitted answers hide. A hidden field therefore never
  reaches the stored payload — nor the label snapshot — and is never held to its own `required`,
  even when something posts a value for it anyway. What the answers _reveal_ is kept, which is what
  will let a visitor whose script showed them a further question have its answer stored.

  `defineForm` now also runs the field checks a `register*MetaBox` call runs, published from core as
  `assertMetaBoxFields` beside the compile and projection pair it completes. A form is not
  registered, so nothing else was running them, and each one it skipped failed silently at submit
  instead: a field keyed `__plumix_hp` shadowed the honeypot and filed every answer as spam, two
  fields claiming one key dropped one of the two answers, and a condition naming a field the form
  does not declare hid its own field for good.

- [#2095](https://github.com/withplumix/plumix/pull/2095) [`8bdb8a3`](https://github.com/withplumix/plumix/commit/8bdb8a34dd366975b3e3bf967e0a3fbf63249381) Thanks [@nasyrov](https://github.com/nasyrov)! - Publishes the five helpers the forms and comments plugins had each written for themselves, and
  fixes a return-URL bug in `@plumix/plugin-forms` on the way.

  Each of the five was a fact about core's own wire format — the header its CSRF gate reads, the
  marker its islands bootstrap writes, the origin rule its dispatcher enforces — that a plugin had to
  rediscover. Core is now the one that says them.

  `resolveReturnUrl` on `plumix` resolves where to send a visitor after a form post the browser
  submitted, holding every candidate to an origin the site answers on and refusing the endpoint's own
  path, so the answer can be turned into neither an open redirect nor a loop.

  `useIsLive`, `documentBasePath` and `VISUALLY_HIDDEN_STYLE` join `plumix/blocks/renderer`.
  `useIsLive` is false through the server render and the first client render and true once a
  component is live, which is how progressive enhancement tells markup that shipped from JavaScript
  that ran. `documentBasePath` reads the subdirectory prefix off the islands bootstrap marker, for
  the callers `useBasePath` cannot serve because a hydrated island has no `PlumixProvider` context.
  `VISUALLY_HIDDEN_STYLE` is the `.sr-only` recipe inline, so hiding never depends on a stylesheet
  the page did not load.

  `CSRF_HEADER_NAME` and `CSRF_HEADER_VALUE` are now on `plumix/blocks`, alongside the existing
  export from `plumix`. They are defined in `@plumix/blocks` and re-exported by core rather than the
  reverse: the senders are islands, and a `"use client"` module reaching for `plumix` to name the
  header would pull the database, the authenticator and the dispatcher into a browser bundle.

  The forms fix: its own copy of the return-URL resolver parsed each candidate with no base and
  accepted only the configured origin. A relative `returnTo` — the natural thing for a template to
  pass — was refused outright rather than read as a path on the site, and on a multi-host deploy
  every candidate failed the origin test, so every submitter was sent to the site root. The shared
  resolver accepts both the request's origin and the configured one, which is the pair the
  dispatcher's own Origin check accepts.

  No public API was removed from either plugin; the copies were internal.

- [#2069](https://github.com/withplumix/plumix/pull/2069) [`9716e54`](https://github.com/withplumix/plumix/commit/9716e54354ccbd928dc9653bdfe1b29fc6a809ce) Thanks [@nasyrov](https://github.com/nasyrov)! - A form can now declare `bind` and carry the row whose page it was rendered on — an `entry`, a
  `term` or an `author` — so a subscribe form on a school's page knows which school without a
  developer threading an id through the block, the template or the theme.

  ```ts
  const subscribe = defineForm("subscribe", {
    bind: "entry",
    fields: [email("email").required()],
    onSubmit: ({ bound, answers }) => enrol(bound?.id ?? null, answers.email),
  });
  ```

  The value is resolved on the server at render, from the row the URL already matched, so binding
  costs no second lookup. It travels as a signed token — the kind, the id, and an HMAC over both
  _and_ this form — under a per-install secret generated on first use and kept in the settings table,
  so there is no environment variable and no binding to configure. Every other form system carries
  the bound value in a plain hidden input, one devtools edit from submitting against a different
  row; here the value and its signature travel together and the server reads the value back only out
  of a token it signed. Edit any part and the submission is refused, as is a token minted for one
  form and replayed against another, or one whose kind was rewritten — the slug and the kind are
  both inside what was signed, so entry 7's token cannot be posted as term 7.

  The verified `bound` reaches `validate` and `onSubmit` as `{ type, id }`, and is stored in the new
  indexed `bound_type` / `bound_id` columns rather than among the answers, so every submission for
  one row is a query rather than a scan — **run `plumix migrate generate` after upgrading**. Both
  columns are asked for together, because ids are unique only within their own table and because the
  index is partial: a query on `bound_type` alone falls back to a scan.

  ```ts
  const enquiries = await ctx.db
    .select()
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.boundType, "entry"),
        eq(formSubmissions.boundId, school.id),
      ),
    );
  ```

  The token is about the page rather than the visitor, so two renders of one page produce the same
  bytes and a page carrying a bound form stays edge-cacheable; for the same reason it does not
  expire, and the columns carry no foreign key, so a submission outlives the row it names.

  A bound form placed on a page of any other kind carries no token and stores nothing — a front
  page, a footer, an archive, a synced pattern, and equally a term page under a form that asked for
  an entry. Changing a form's `bind` has the same effect on pages the edge is still serving from
  before the change: the old token verifies, but its kind is no longer the one the form asks for, so
  the submission is accepted and stores nothing rather than handing a handler the wrong kind of id.
  Read `bound` as optional wherever the same form appears in more than one place.

  `plumix/blocks` gains the `BlockLoaderArgs` and `MaterializedAttrs` types, which a plugin
  declaring a block loader could not previously name.

### Patch Changes

- [#2097](https://github.com/withplumix/plumix/pull/2097) [`a74cf73`](https://github.com/withplumix/plumix/commit/a74cf731f9dd5809f12961bc1ed9a989ab1f9a08) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `useAuth` returning a React element instead of running during the server render. The module
  carried a `"use client"` directive, and the directive marks an _island_ — the SSR pass replaces
  every export of a module carrying one with a shim component — so a theme doing
  `const { user, loading } = useAuth()` read `undefined` for both on the server and rendered its
  signed-out branch with no loading state. The hook now runs on the server, settling to
  `{ user: null, loading: true }` until the client probe resolves, which is what a cache-shared
  anonymous render should say. The build now refuses a first-party `"use client"` module that
  exports a hook-shaped name rather than shimming it; a dependency's own hook exports are left
  alone.
- Updated dependencies [[`dc901b1`](https://github.com/withplumix/plumix/commit/dc901b1ea30330cbdcca63f8a00e5e40f0f54e1b), [`286d0fd`](https://github.com/withplumix/plumix/commit/286d0fd1466a39504452df07008bffc16b2333ef), [`286d0fd`](https://github.com/withplumix/plumix/commit/286d0fd1466a39504452df07008bffc16b2333ef), [`de0f56f`](https://github.com/withplumix/plumix/commit/de0f56ff7a5e96b896c9e4c81ac2f277e873cd9f), [`a74cf73`](https://github.com/withplumix/plumix/commit/a74cf731f9dd5809f12961bc1ed9a989ab1f9a08), [`b88e2f3`](https://github.com/withplumix/plumix/commit/b88e2f39608fd6b7f68d40ef989bd9d55f655a73), [`8aa171f`](https://github.com/withplumix/plumix/commit/8aa171f34e562f3a0176e802abaf63f5639002cc), [`ad062d7`](https://github.com/withplumix/plumix/commit/ad062d71bce7201f4b9bef038f1d2837e4157ae2), [`d79b4b5`](https://github.com/withplumix/plumix/commit/d79b4b597a26dd073cc32a3e89a232c58173aab0), [`3290448`](https://github.com/withplumix/plumix/commit/3290448915db0b8ee89528962a407c518c7bc29e), [`6825fbf`](https://github.com/withplumix/plumix/commit/6825fbfbbd2431e662a79af09165f323e9a8718f), [`421e39a`](https://github.com/withplumix/plumix/commit/421e39a62cd62a565e8424bb06d9d0289d69764c), [`7b36faf`](https://github.com/withplumix/plumix/commit/7b36faf5b7a0a0bcc9f5db8a244464975a5ecd42), [`022401e`](https://github.com/withplumix/plumix/commit/022401e1b77978bfe0d97cde5213609823f67329), [`1bd1d33`](https://github.com/withplumix/plumix/commit/1bd1d33be5585e6c935b31a390b5917528f7e455), [`fa1a0d7`](https://github.com/withplumix/plumix/commit/fa1a0d7657060e61a3f17df133f6e5e38cbccad7), [`18140f3`](https://github.com/withplumix/plumix/commit/18140f33c37fb346dc297179fe01f2792d41a350), [`8bdb8a3`](https://github.com/withplumix/plumix/commit/8bdb8a34dd366975b3e3bf967e0a3fbf63249381), [`9ebc490`](https://github.com/withplumix/plumix/commit/9ebc4901f8ad99101904901a2543ce3c32a3f695), [`4d09ee2`](https://github.com/withplumix/plumix/commit/4d09ee28b8f2f8a7dd6bcd320baf8171cf6b1df0), [`1b8185e`](https://github.com/withplumix/plumix/commit/1b8185e6e289eb2f52e8abd01ac85594b765d719)]:
  - @plumix/admin-editor@0.19.0
  - @plumix/admin-ui@0.19.0
  - @plumix/blocks@0.19.0
  - @plumix/core@0.19.0
  - @plumix/admin@0.19.0

## 0.18.0

### Minor Changes

- [#2050](https://github.com/withplumix/plumix/pull/2050) [`fed1b0d`](https://github.com/withplumix/plumix/commit/fed1b0d8ae49cb66fdac268c29cb4067750acd66) Thanks [@nasyrov](https://github.com/nasyrov)! - Runs the `render:document` filter chain on error pages, and tells a plugin which entry type an
  archive lists.

  A 404 or 500 rendered through the theme previously skipped `render:document` entirely, so a plugin
  writing head tags reached every page except the ones it most needed to — a page that was not found
  had no way to say `noindex`. The chain now runs there with the error payload, which `pageFacts`
  already describes as `kind: "error"`.

  `applyCanonical` deliberately still does not run on that path: a URL that resolved to nothing must
  not declare itself the canonical address of anything. The filter is applied inside a `try` there,
  unlike on the happy path — `applyFilter` does not isolate a throwing subscriber, and this render is
  already the failure path, so letting one escalate would hide a clean 404 behind a themed 500.

  A theme's string `titleTemplate` now substitutes `%s` through a function replacement, so `$&`,
  `` $` ``, `$'` and `$$` in a page title are the characters an author typed rather than replacement
  patterns. An entry titled `Q&A: $& explained` previously rendered as `Q&A: %s explained`.

  `PageFacts` gains `contentType` — the entry type an entry-type archive lists, and null on every
  other page kind, including a single entry whose own type is on `entry`. Without it a consumer
  reasoning about "this whole type" had to re-derive the subject from the render payload, which is
  the projection `pageFacts` exists to prevent.

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

- [#2042](https://github.com/withplumix/plumix/pull/2042) [`dc8bc1c`](https://github.com/withplumix/plumix/commit/dc8bc1ca95dccdc0ca1ab149fa8c1420ea1891d9) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `registerPublicRoute`, so a plugin can own a path at the site root instead of being confined
  to the `/_plumix/<pluginId>/` prefix `registerRoute` mounts it under. `path` is an exact pathname
  or a URLPattern pathname whose captured groups reach the handler as its third argument, and
  `cacheable: true` opts the response into the edge cache on the same terms a plugin route already
  gets — the URL is the whole key, freshness is the `cache-control` the handler set, and the entry
  stores under whatever the handler named through `tagCacheEntry`.

  Registered routes match ahead of core's own robots, sitemap and feed branches, ahead of the
  redirect table and ahead of the content route map, so a plugin's route can shadow core's built-in
  one outright. That is deliberate: it is what lets `/robots.txt`, the sitemap and the feeds move
  into `@plumix/plugin-seo` and `@plumix/plugin-feeds` as additions rather than as simultaneous
  add-and-delete releases. The handler always answers — there is no fall-through to the page that
  would otherwise own the path — which is affordable because a plugin registers from the
  `theme:ready` action, where every entry type and taxonomy is known, and so claims concrete paths
  rather than guessing at request time. Two plugins claiming one path, or a path inside `/_plumix/`,
  throws at boot naming both owners.

  The canonical normalizer's exemption list now derives from that route table as well as its
  hardcoded literals, so a URL that would normalize onto a registered endpoint is left alone rather
  than 301'd at it — the behaviour core's hardcoded `/feed` literal gives today, kept once the
  literals naming these paths are gone. The handler runs ahead of the access gate and the principal
  loader, so `ctx.user` is null and a route that enumerates content is enumerating it for an
  anonymous reader. Nothing changes for a site with no plugin registering a public route.

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

### Patch Changes

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

- Updated dependencies [[`fed1b0d`](https://github.com/withplumix/plumix/commit/fed1b0d8ae49cb66fdac268c29cb4067750acd66), [`f28dfe3`](https://github.com/withplumix/plumix/commit/f28dfe3fa0012e26ddb68a63405b3321bd7b85c9), [`0d81cce`](https://github.com/withplumix/plumix/commit/0d81ccefd10144ab09316386fa46cc114ec9a080), [`8e5776b`](https://github.com/withplumix/plumix/commit/8e5776b48f2b58152b0c668860258e20a51eeb9d), [`dc8bc1c`](https://github.com/withplumix/plumix/commit/dc8bc1ca95dccdc0ca1ab149fa8c1420ea1891d9), [`f50a4b9`](https://github.com/withplumix/plumix/commit/f50a4b9d210cf158f2eff6368696f614d27c9435), [`9967c91`](https://github.com/withplumix/plumix/commit/9967c91f3406290fe8ebab250fbd2cf3da008e1e), [`6e0f239`](https://github.com/withplumix/plumix/commit/6e0f2394a08dd7c961c0be6b3b593884aaedf624), [`d3d550c`](https://github.com/withplumix/plumix/commit/d3d550c4b87405d1c26e8e78c4adbda229d2727c)]:
  - @plumix/core@0.18.0
  - @plumix/admin@0.18.0
  - @plumix/admin-editor@0.18.0
  - @plumix/admin-ui@0.18.0
  - @plumix/blocks@0.18.0

## 0.17.0

### Minor Changes

- [#2039](https://github.com/withplumix/plumix/pull/2039) [`db7cdba`](https://github.com/withplumix/plumix/commit/db7cdbaaaec94601ff4f630559ccb0d01bfde33f) Thanks [@nasyrov](https://github.com/nasyrov)! - Puts a second gate in front of every development-only surface. `PLUMIX_DEV` says a dev server is
  running; it says nothing about who reached it, and `plumix dev` is routinely reachable from off-box
  — a tunnel opened to test a webhook, a container bound to `0.0.0.0`, a forwarded codespace port.
  Core now also requires the request to have arrived over loopback before it injects the debug bar,
  serves `/_plumix/debug/requests`, or renders the dev error page, and the Vite plugin applies the
  same rule to the dev endpoints that answer ahead of the worker — the source-excerpt reader behind
  the error page's frames, the two sourcemap resolvers, and the browser-errors-to-terminal sink.
  Off-loopback each is absent rather than refused: no bar in the markup, a 404 on the history, and
  the theme's own `server-error` page in place of the dev one. What is withheld is the disclosure,
  not the site.

  Adds `auth: "development"` to the plugin route model, so a route that exists only while you are
  developing declares that rather than `auth: "public"` and inherits the same two gates. It answers
  404 off-loopback, since the existence of the route is itself development detail. The OG plugin's
  card preview takes it — the surface that motivated the change, since it runs a theme-authored
  `render` and resolves whatever template deps the card declared against a request carrying no
  session. `registerRestResource` keeps the narrower `RestResourceAuth`: a REST resource is part of
  the documented public API and has nowhere to publish a dev-only gate.

  `PLUMIX_DEV_ALLOW_REMOTE=1` is the deliberate opt-out, for reviewing on a phone, demoing through a
  tunnel or working in a codespace. Like the other dev-only variables it is substituted at bundle
  time and empty in a production build, so it cannot follow you to a deploy. The MCP endpoint keeps
  its own stricter gate — off-loopback it falls back to bearer-token authentication rather than
  closing, so the opt-out has nothing to open there.

- [#2038](https://github.com/withplumix/plumix/pull/2038) [`06dee0c`](https://github.com/withplumix/plumix/commit/06dee0c4de59a7d93f1545f75bd93e63b1c0199c) Thanks [@nasyrov](https://github.com/nasyrov)! - Makes the dev error page's two filters nameable outside core. `error_page:hints` and
  `error_page:panels` were both documented as the plugin-facing way to contribute to the page, but
  their type augmentations sat outside the closure the package barrel anchors, so a plugin writing
  `ctx.addFilter("error_page:panels", …)` got `Argument of type '"error_page:panels"' is not
assignable to parameter of type 'FilterName'` — the same defect `debug_bar:panels` had. Core now
  anchors both.

  Promoting them rather than correcting the comments is what the code already implied:
  `error_page:panels` has no core subscriber at all, so every panel it collects has to come from a
  plugin. A filter nothing outside core can name collects nothing, ever, and the honest alternative
  was deleting it.

  The contribution shapes `DevErrorHint` and `DevErrorPanel` are exported alongside the
  presentational pieces a panel body is built from — `DevErrorFacts`, `DevErrorSubhead` and
  `DevErrorEmptyNote`, the same three the page's own sections use, so a contributed panel wears the
  page's markup instead of re-spelling its class names.

- [#2005](https://github.com/withplumix/plumix/pull/2005) [`7bbef7c`](https://github.com/withplumix/plumix/commit/7bbef7c47a4ddb2162daf215f25b9dadf1ea3125) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds two development-only surfaces to the OG plugin. `/_plumix/og/preview` renders every declared
  card rule against sample data, one card per rule at `/_plumix/og/preview/<n>.<ext>`, listed in the
  order a page resolves against them rather than the order they were declared in. It reads nothing
  from storage and caches nothing, so a refresh re-renders and an edit shows up; that bypass is a
  requirement rather than a convenience, since a served card is content-addressed and every edit otherwise lands on a different
  URL with the previous render sitting immutable in the bucket. The sample data is invented rather
  than looked up, so the preview works on a site with no content in it, and a rule's matcher
  contributes the names it narrows on.

  A debug-bar panel answers the second question a card author asks. Four links resolve a page's
  `og:image` and the rendered markup says nothing about which of them won, so the panel names it — the explicit `.ogImage()`
  role, the entry's featured photo, the card and the rule that produced it, or the site-wide default
  — along with the reason there is no card on the page. That is where a renderer whose format
  scrapers cannot read is reported, which is why no boot-time warning exists for it.

  Both surfaces sit behind the `PLUMIX_DEV` gate and a dynamic import, the same shape core uses for
  its own dev-only routes, so neither leaves anything in a production build.

  Makes `debug_bar:panels` a hook a plugin can actually name. Its declaration was outside the closure
  the package barrel anchors, so nothing outside core could subscribe to it however clearly the docs
  said otherwise; core now anchors it and exports the bar's presentational primitives
  (`DebugSection`, `DebugKV`) so a contributed panel reads like the ones core registers.
  `ruleLabel` joins `resolveRule` on the public surface, and the `isJsonObject` and `isJsonArray`
  guards join the `JsonValue` type they narrow.

### Patch Changes

- [#2011](https://github.com/withplumix/plumix/pull/2011) [`712f764`](https://github.com/withplumix/plumix/commit/712f764f212ba3a8c02c60f01efed40fa393ed49) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes plugin admin catalogs never being staged or fetched on a pnpm-installed site. The bundler
  decided a plugin's catalogs were already baked into the admin bundle by asking whether
  `node_modules/@plumix/plugin-<id>` is a symlink — but under pnpm every package is one, registry
  tarballs included, so it skipped emitting catalog URLs for plugins that bundle had never seen. It
  now resolves the entry and keeps the skip only for a target inside the plumix monorepo's
  `packages/plugins`, the directory the bundle's glob actually covers.

  npm sites were never affected, and a pnpm site whose plugin versions matched its `@plumix/admin`
  saw correct translations anyway, since that bundle carries first-party catalogs of its own. What
  was broken is everything outside that overlap: a plugin newer than the installed admin, a plugin
  its glob never saw, or a string added since it was built, all fell back to English with no way to
  load the catalog that would have covered them. pnpm and npm sites no longer diverge here.

- [#2010](https://github.com/withplumix/plumix/pull/2010) [`d9cb874`](https://github.com/withplumix/plumix/commit/d9cb87447fd859a1d940dd8ce990571b79b88469) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolves a plugin package whose id carries an underscore. `PLUGIN_ID_RE` admits
  `_`, npm names conventionally use `-`, and nothing reconciles the two —
  `audit_log` ships as `@plumix/plugin-audit-log`. `findPluginPackageRoot` built
  its candidates from the id verbatim, so it resolved nothing for that plugin and
  `plumix build` failed with `adminAssetNotFound` for catalogs sitting in the
  tarball all along. `isAdminBundledPlugin` read the same name and reported every
  such plugin as unbundled. Both now try the hyphenated form after the literal
  one, so a package whose name really does contain `_` still wins.

  Previously masked: `audit_log` was the only affected first-party plugin, and it
  declared only its source locale, so the manifest never emitted a catalog URL and
  the resolution was never attempted.

- Updated dependencies [[`db7cdba`](https://github.com/withplumix/plumix/commit/db7cdbaaaec94601ff4f630559ccb0d01bfde33f), [`06dee0c`](https://github.com/withplumix/plumix/commit/06dee0c4de59a7d93f1545f75bd93e63b1c0199c), [`228ef18`](https://github.com/withplumix/plumix/commit/228ef184588c7815a029f51bb764a15de022dde7), [`f169434`](https://github.com/withplumix/plumix/commit/f1694341ec80ac99e9f31243605f35fbb7c6f823), [`7bbef7c`](https://github.com/withplumix/plumix/commit/7bbef7c47a4ddb2162daf215f25b9dadf1ea3125), [`5b30da7`](https://github.com/withplumix/plumix/commit/5b30da79f79563e1578bc940f46fd26836570287), [`3a7c64a`](https://github.com/withplumix/plumix/commit/3a7c64a56238e148af7088f28e447acca9b4ab79), [`f5d786a`](https://github.com/withplumix/plumix/commit/f5d786ad6fa0341e6c72c12f011ada40204470fc), [`2a81bf2`](https://github.com/withplumix/plumix/commit/2a81bf24a2d163e8cc3965770ed9bdae9afd5a2e), [`1c67995`](https://github.com/withplumix/plumix/commit/1c67995236f52b0c01a3594d7eab3746191cac5d), [`ce79cc1`](https://github.com/withplumix/plumix/commit/ce79cc17a931bcd5809bad80c71ebcaaed473cd2), [`d4f1001`](https://github.com/withplumix/plumix/commit/d4f10014d60ec42ee40afbe12217b6e0cd810690), [`e581fcf`](https://github.com/withplumix/plumix/commit/e581fcf310170f9a12f6dd264879c851ef08b0d1), [`0390823`](https://github.com/withplumix/plumix/commit/0390823543fb23edf83c8df54671cb7933c9a51f), [`86deb49`](https://github.com/withplumix/plumix/commit/86deb49d04e398de9ded95844ace7a8594d254bd), [`9950906`](https://github.com/withplumix/plumix/commit/9950906203c3174ff99e9fe48f196b64754b1fb8), [`c5945d4`](https://github.com/withplumix/plumix/commit/c5945d4e055b53d546aa87a9bdf4f9c0e9384f91), [`d3c61bf`](https://github.com/withplumix/plumix/commit/d3c61bfa26d2a9cd1b02a4d61a912148e414189b), [`107724d`](https://github.com/withplumix/plumix/commit/107724d272cf534946443eb567848949c4ca3eaa)]:
  - @plumix/core@0.17.0
  - @plumix/blocks@0.17.0
  - @plumix/admin@0.17.0
  - @plumix/admin-editor@0.17.0
  - @plumix/admin-ui@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`2f70692`](https://github.com/withplumix/plumix/commit/2f70692410fc65a66e843a4db33170c1ad954dc1), [`b2b6510`](https://github.com/withplumix/plumix/commit/b2b6510460703249f17dcd0ba676dab3b7ef2caa), [`9927a8f`](https://github.com/withplumix/plumix/commit/9927a8f7e1470a5f6bef1e5517545e3250d91feb), [`1a475b5`](https://github.com/withplumix/plumix/commit/1a475b599314a315a850832fd59f0cedec22e675), [`1b97c01`](https://github.com/withplumix/plumix/commit/1b97c01a99828538110e1cefd60dbcff3828c92f), [`6cc8e74`](https://github.com/withplumix/plumix/commit/6cc8e742f4ac44bc06a44cdc440e2852f7124900), [`f9b705f`](https://github.com/withplumix/plumix/commit/f9b705f4e423aea61cbdb13e9c2b3ca86a544257), [`efe3834`](https://github.com/withplumix/plumix/commit/efe3834bebb073105d6912152091627cce700a63), [`9cf71d9`](https://github.com/withplumix/plumix/commit/9cf71d92e67aa95635a06cfef8e019bb6fab603d)]:
  - @plumix/blocks@0.16.0
  - @plumix/core@0.16.0
  - @plumix/admin@0.16.0
  - @plumix/admin-editor@0.16.0
  - @plumix/admin-ui@0.16.0

## 0.15.0

### Minor Changes

- [#1878](https://github.com/withplumix/plumix/pull/1878) [`14eb419`](https://github.com/withplumix/plumix/commit/14eb4190b9715144dcafe885866b5a7fc456e06a) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `coreShortcodes`, `ShortcodeSpec` and `PlumixPrefetch` to `plumix/blocks`. All three were already public on `@plumix/blocks` but had never been forwarded to the façade, so reaching them meant importing the internal package by name. `coreShortcodes` is the shortcode analogue of `coreBlocks` and `coreMarks`, and `ShortcodeSpec` and `PlumixPrefetch` complete pairs whose siblings — `BlockSpec`, `MarkSpec`, `PlumixStrategy` — the façade already forwards.

### Patch Changes

- Updated dependencies [[`c0771f0`](https://github.com/withplumix/plumix/commit/c0771f010290452887f758483a25a2e303dbf346), [`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4), [`b39380a`](https://github.com/withplumix/plumix/commit/b39380a7dab2780ec1f36729328258b529b85800), [`82fa032`](https://github.com/withplumix/plumix/commit/82fa0323aada1c0c37e17261a4d2c62f7b585584), [`064ff07`](https://github.com/withplumix/plumix/commit/064ff07cbf36728beb2afcfcddfe82f0fd36f193), [`cfae716`](https://github.com/withplumix/plumix/commit/cfae716b9a39873db45ccb79083f4e1753e14744), [`e5d9d6b`](https://github.com/withplumix/plumix/commit/e5d9d6bef5b901206a3fd4f9a68d84b9edadb4ef), [`482b4e6`](https://github.com/withplumix/plumix/commit/482b4e697cbf6b2f014e712315050f474f502fe0), [`b014e4d`](https://github.com/withplumix/plumix/commit/b014e4d212f1ccde8af3dd1464a1fea4143b97f9), [`fdd72b8`](https://github.com/withplumix/plumix/commit/fdd72b89167237d25bc3ced465e0d2543c37b40b), [`b6dcb7f`](https://github.com/withplumix/plumix/commit/b6dcb7f0a507dd1989e0ca3b86b0fb16927487f0), [`5a24bfc`](https://github.com/withplumix/plumix/commit/5a24bfcd445c2cf1b89224f5ec07f4fef1080c57)]:
  - @plumix/core@0.15.0
  - @plumix/blocks@0.15.0
  - @plumix/admin-editor@0.15.0
  - @plumix/admin@0.15.0
  - @plumix/admin-ui@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`7c7be38`](https://github.com/withplumix/plumix/commit/7c7be38e813530a3e27dd7d34df509470b5d1280), [`56cdc6f`](https://github.com/withplumix/plumix/commit/56cdc6f616413c4d20be9a3cccff303259cae1ac), [`4155a46`](https://github.com/withplumix/plumix/commit/4155a467dcd5e358d3c335849943e7683fc804cd), [`f579afb`](https://github.com/withplumix/plumix/commit/f579afbbf0e297b1c591d23a2c3b20c178880bc6), [`320f222`](https://github.com/withplumix/plumix/commit/320f222c5b365079a8f618b1955dbb2e59bd37d8)]:
  - @plumix/core@0.14.0
  - @plumix/admin@0.14.0
  - @plumix/admin-editor@0.14.0
  - @plumix/blocks@0.14.0
  - @plumix/admin-ui@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`f3971a8`](https://github.com/withplumix/plumix/commit/f3971a8ec726a12ab7aa2e0c2897d48f3d5c4889), [`6d6db5c`](https://github.com/withplumix/plumix/commit/6d6db5c6a2defabfc0737f570f4d30a40c7ee67d), [`4f5730d`](https://github.com/withplumix/plumix/commit/4f5730dcaecb587396c41f7c10229f3689de52c8), [`dcda2fa`](https://github.com/withplumix/plumix/commit/dcda2fa124117175f5a56f587c22e95d6f14d89e), [`202a1fc`](https://github.com/withplumix/plumix/commit/202a1fc788e5386c08ba6c9d69bbba49c3503fc6), [`c01d2a3`](https://github.com/withplumix/plumix/commit/c01d2a3f843cdf743ba2f4cc5812c245cb9d918d)]:
  - @plumix/core@0.13.0
  - @plumix/blocks@0.13.0
  - @plumix/admin@0.13.0
  - @plumix/admin-editor@0.13.0
  - @plumix/admin-ui@0.13.0

## 0.12.0

### Minor Changes

- [#1680](https://github.com/withplumix/plumix/pull/1680) [`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af) Thanks [@nasyrov](https://github.com/nasyrov)! - Install the dev-only client error tools from one core-owned entry point.

  The island error dialog, the browser-errors-to-terminal forwarder, and the
  compile/import error overlay are now installed from a single browser-safe
  `@plumix/core/dev-client` export (reached through the `plumix` package as
  `plumix/core/dev-client`), which the generated client bootstrap calls behind the
  `import.meta.hot` dev gate. `@plumix/blocks`'s island runtime no longer installs
  any overlay or forwarder — it only hydrates islands and dispatches the
  `plumix:island-*` events the core-installed dialog listens for. The dependency
  runs core → blocks (no cycle), and nothing in `@plumix/blocks` outside its
  `dev-error/` implementation imports dev-error.

  This is behind the existing `PLUMIX_DEV` / `import.meta.hot` gates, so it
  tree-shakes out of production exactly as before: an island hydration mismatch
  still shows the dialog, a Vite compile error still shows the overlay, and client
  errors still forward to the terminal — now all wired from one place.

  The `plumix/blocks/dev-error` subpath — an internal wiring seam the generated
  client bootstrap used to reach the compile overlay — is removed, since install
  now goes through `plumix/core/dev-client`. The dev-error implementations
  themselves remain in `@plumix/blocks` and are unaffected.

- [#1706](https://github.com/withplumix/plumix/pull/1706) [`6da618c`](https://github.com/withplumix/plumix/commit/6da618c216924fa966cb735ef33c16451383b4b0) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `plumix/db` (`@plumix/core/db`) subpath and complete the direct-write toolkit.

  A plugin running a bulk-ingest pipeline writes directly to `ctx.db`, which
  bypasses core's entry-mutation service — so no `entry:*`/`term:*` action fires
  and core's edge-cache purge invalidator never runs, leaving the public archive
  and permalinks stale until TTL. Making that path first-class needed two things
  the public API didn't expose:

  - **The edge-cache tag vocabulary.** `typeTag`, `entryTag`, `entryPurgeTags`,
    `termPurgeTags`, and `enqueuePurgeTags` are now exported, so a direct-write
    plugin can enqueue the same coarse `t:<type>`/`e:<id>` tags core would —
    `enqueuePurgeTags(ctx, entryPurgeTags(type, id))` — for the post-request /
    scheduled flush, instead of hand-restating the scheme (PRD [#1080](https://github.com/withplumix/plumix/issues/1080)) and drifting
    when it changes.
  - **The Drizzle table-introspection helpers.** `getTableColumns`, `getTableName`,
    and `is` live on the `drizzle-orm` root rather than its `/sql` subpath, so they
    weren't reachable through core. `getTableColumns` in particular is how a bulk
    `onConflictDoUpdate` derives its set clause — without it a plugin had to add
    its own `drizzle-orm` dependency (which can drift from core's pinned version).

  The new `plumix/db` / `@plumix/core/db` subpath groups the whole toolkit — query
  operators, schema tables, introspection helpers, and the purge vocabulary — in
  one import so a direct-write plugin never needs its own `drizzle-orm`
  dependency. Everything is also reachable from the flat package root.

### Patch Changes

- [#1704](https://github.com/withplumix/plumix/pull/1704) [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix `IslandPropSerializationError: Cyclic reference` when a `"use client"` island
  renders a shared client primitive such as a Radix/shadcn context component (e.g.
  `Tabs`).

  Island props are now serialized exactly once, at the outermost boundary. A
  `"use client"` component becomes an island when it carries an explicit hydration
  directive (`client=…`) or is the outermost such component in the render; a
  non-directive `"use client"` component rendered inside an island now renders
  inline (bundled into the parent island) instead of becoming its own island and
  re-serializing props. This stops the serializer from walking the cyclic React
  Context objects that libraries like Radix thread through their internals.

  Components passed into an island as `children`/slots still become their own
  island and hydrate independently, and intentional nested islands (an explicit
  `client=` directive) are unchanged.

- Updated dependencies [[`c5facfe`](https://github.com/withplumix/plumix/commit/c5facfee050d3f5880de31dc6866dd48c4ac3d41), [`665a57b`](https://github.com/withplumix/plumix/commit/665a57b421fc2f82dcf0dad7d0a89e2497557959), [`c74ca2f`](https://github.com/withplumix/plumix/commit/c74ca2ffc069209d543e5d606a2ded8b22245a1e), [`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af), [`30f287e`](https://github.com/withplumix/plumix/commit/30f287e72470efd50ce4e95183c4f7e89f8e0843), [`88b6db2`](https://github.com/withplumix/plumix/commit/88b6db2b94c94a0a9c12f4d8cb84289f28cd7558), [`6da618c`](https://github.com/withplumix/plumix/commit/6da618c216924fa966cb735ef33c16451383b4b0), [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c), [`05ea95c`](https://github.com/withplumix/plumix/commit/05ea95c65a798ea2b74b7b3f3f533471aa4a483e), [`66bce99`](https://github.com/withplumix/plumix/commit/66bce99343595168a13272b947cebb074aa30650), [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a), [`5785f19`](https://github.com/withplumix/plumix/commit/5785f19862495b1c445640fbc58a3210d6b0c2ff)]:
  - @plumix/core@0.12.0
  - @plumix/blocks@0.12.0
  - @plumix/admin-editor@0.12.0
  - @plumix/admin@0.12.0
  - @plumix/admin-ui@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`77ef988`](https://github.com/withplumix/plumix/commit/77ef988411eed32144bd4d5fabcc497fbbbac9ef), [`168466a`](https://github.com/withplumix/plumix/commit/168466a3e473a81ce77c0acff6678bbeac1dea9b)]:
  - @plumix/blocks@0.11.0
  - @plumix/admin@0.11.0
  - @plumix/admin-editor@0.11.0
  - @plumix/core@0.11.0
  - @plumix/admin-ui@0.11.0

## 0.10.0

### Minor Changes

- [#1661](https://github.com/withplumix/plumix/pull/1661) [`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d) Thanks [@nasyrov](https://github.com/nasyrov)! - Retain forwarded client errors in a dev ring behind a read endpoint.

  In `plumix dev`, the browser-errors-to-terminal forwarder now also keeps each
  already-sourcemapped client failure — uncaught exceptions, unhandled rejections,
  island and hydration errors, and forwarded `console` errors/warnings — in a
  bounded ring alongside the existing terminal print. The ring is capacity- and
  byte-bounded with per-string truncation, mirroring the server-side request
  history store, so a burst of client errors can't pin memory.

  A new dev-only GET endpoint returns the retained entries newest-first, each
  preserving `source: "client"`, its level, message, resolved stack, and the
  island/component label when present. This is the client half of the dev-only MCP
  `error_list` surface: the worker-side tool merges these entries with its
  server-side projection. Terminal printing is unchanged, and the whole path stays
  gated on `process.env.PLUMIX_DEV` and tree-shakes out of production.

### Patch Changes

- Updated dependencies [[`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d)]:
  - @plumix/blocks@0.10.0
  - @plumix/admin@0.10.0
  - @plumix/admin-editor@0.10.0
  - @plumix/core@0.10.0
  - @plumix/admin-ui@0.10.0

## 0.9.0

### Minor Changes

- [#1651](https://github.com/withplumix/plumix/pull/1651) [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an open-in-editor path remap for container and remote dev servers.

  The dev error page's "Open in editor" links use the file path as the dev server
  sees it, which doesn't exist on your machine when the server runs in a container,
  a devcontainer, or on a remote/SSH box. Set `PLUMIX_EDITOR_PATH_MAP` to a
  `from=>to` mapping (e.g. `/workspace=>/Users/me/proj`) and the on-server path
  prefix is rewritten to the editor-host path before each link is built, so the
  links open the right file. Only the path prefix is remapped, on a path boundary;
  paths outside it are left untouched. Like `PLUMIX_EDITOR`, it is read only in
  `plumix dev` and tree-shakes out of production builds.

- [#1647](https://github.com/withplumix/plumix/pull/1647) [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an opt-in `log` level to the dev browser-errors-to-terminal forwarder.

  The forwarder ([#1604](https://github.com/withplumix/plumix/issues/1604)) deliberately mirrors only `console.error`/`console.warn`
  and uncaught exceptions to the `plumix dev` terminal, because plain logs are
  noisy. Setting `PLUMIX_FORWARD_ERRORS=log` now additionally forwards
  `console.log`, `console.info`, and `console.debug`, printed through the same
  `[browser]`-tagged, sourcemapped, repeat-collapsing path as everything else — so
  the verbose case stays on one contract rather than splitting output to Vite's
  native `forwardConsole`. The default is unchanged (`warn`), and the whole path
  remains dev-only and tree-shaken from production island bundles.

- [#1643](https://github.com/withplumix/plumix/pull/1643) [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80) Thanks [@nasyrov](https://github.com/nasyrov)! - Unify Vite's compile/import errors with the dev error surface.

  In `plumix dev`, a syntax error or a bad import used to show Vite's own error
  overlay — visually and behaviorally disjoint from the plumix dev error page and
  the client island overlay. Plumix now disables Vite's built-in overlay
  (`server.hmr.overlay: false`) and installs its own from the always-present dev
  client entry: it intercepts Vite's `vite:error` HMR payload and renders it
  through the _same_ shared `DevErrorPage` renderer and token sheet, in a Shadow
  DOM modal over a dimmed backdrop. So compile errors now read like every other
  plumix dev error — same header, code frame, and styling — and clear on their own
  when the module recompiles (Escape, the close button, or a backdrop click also
  dismiss). The whole surface is dev-only, gated on `import.meta.hot`, so it
  tree-shakes out of the production client bundle; a user can re-enable Vite's own
  overlay from their `vite` config.

### Patch Changes

- Updated dependencies [[`24d9639`](https://github.com/withplumix/plumix/commit/24d96390631893c788b54fe6261c781ad798969c), [`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e), [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407), [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec), [`c16b2bc`](https://github.com/withplumix/plumix/commit/c16b2bcc112c82459a090a5e59fe263ee55ff658), [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80)]:
  - @plumix/core@0.9.0
  - @plumix/blocks@0.9.0
  - @plumix/admin@0.9.0
  - @plumix/admin-editor@0.9.0
  - @plumix/admin-ui@0.9.0

## 0.8.0

### Minor Changes

- [#1621](https://github.com/withplumix/plumix/pull/1621) [`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5) Thanks [@nasyrov](https://github.com/nasyrov)! - Forward browser/island errors to the dev terminal.

  In `plumix dev`, client failures now also surface where the developer is already
  working. A dev-only catch net mirrors the island error overlay's producers —
  uncaught exceptions, unhandled rejections, and the island renderer's
  `plumix:island-error` / `plumix:hydration-error` events — and additionally
  patches `console.error` and `console.warn` (never `console.log`). Each entry is
  batched and POSTed to a new Vite dev-server endpoint, which sourcemaps the stack
  through the dev server's per-module sourcemaps and prints it tagged `[browser]`
  with a project-relative `file:line`, application frames shown and framework
  frames collapsed to a count. Consecutive identical entries collapse into a
  running `(×N)` count.

  On by default and tuned by `PLUMIX_FORWARD_ERRORS` (`off` disables, `error`
  drops warnings, the default forwards both). Everything is gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production island bundles.
  Vite 8's native `forwardConsole` is disabled by the plugin so client output
  isn't printed twice; a consumer can re-enable it in their own `vite` config.

- [#1617](https://github.com/withplumix/plumix/pull/1617) [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443) Thanks [@nasyrov](https://github.com/nasyrov)! - Open a `plumix dev` error-page stack frame in your editor.

  Each frame on the dev error page now carries an "open in editor" link that jumps
  to the file at the offending line. It is a plain anchor to the editor's URL
  scheme — zero-JS, no server round-trip. The editor is chosen by a dev-only
  `PLUMIX_EDITOR` setting: a known-editor key (`vscode` — the default —
  `vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`, `phpstorm`, `webstorm`,
  `sublime`), a custom `{file}` / `{line}` / `{column}` format string for any other
  editor, or `off` / `none` to drop the link. Everything stays gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production.

- [#1608](https://github.com/withplumix/plumix/pull/1608) [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0) Thanks [@nasyrov](https://github.com/nasyrov)! - Resolve dev error-page stack frames to original source with a code excerpt.

  The `plumix dev` error page now parses the (already-sourcemapped) stack into
  frames showing each original `file:line`, with application frames expanded and
  framework/vendor frames collapsed behind a toggle. Selecting a frame shows a
  source excerpt with the offending line highlighted — lazy-fetched from a new
  dev-only source resolver mounted as a Vite middleware, so the worker (which has
  no filesystem) never reads source itself. Paths are shown relative to the
  project root the frames imply. Everything stays gated on `process.env.PLUMIX_DEV`
  and tree-shakes out of production.

### Patch Changes

- Updated dependencies [[`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5), [`4481cf2`](https://github.com/withplumix/plumix/commit/4481cf28a6b9feef66ddc4f002a2b1bdea9ab725), [`077c515`](https://github.com/withplumix/plumix/commit/077c515e47d3e807d61b5ed4a0ff7cbc94839eff), [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d), [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35), [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443), [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0), [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0), [`112e1bd`](https://github.com/withplumix/plumix/commit/112e1bd6d0ab8f9579ef8a87651d3a996faf75b9), [`a5be41a`](https://github.com/withplumix/plumix/commit/a5be41a282fc4785c7cec582af0e97b3d99bed8a), [`f379b46`](https://github.com/withplumix/plumix/commit/f379b46b4c863bde6d4235a5753e7fd07926153c), [`5beb3ce`](https://github.com/withplumix/plumix/commit/5beb3ced84758f4255356f1118442a45ecaa01b6), [`154e9e4`](https://github.com/withplumix/plumix/commit/154e9e44c538a8a89056f6be6c5e6fbb1d305c36)]:
  - @plumix/blocks@0.8.0
  - @plumix/core@0.8.0
  - @plumix/admin@0.8.0
  - @plumix/admin-editor@0.8.0
  - @plumix/admin-ui@0.8.0

## 0.7.0

### Minor Changes

- [#1536](https://github.com/withplumix/plumix/pull/1536) [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a) Thanks [@nasyrov](https://github.com/nasyrov)! - Enforces every declarative field constraint server-side through one generic walker over the field definitions, and addresses write rejections to the exact field (breaking, pre-1.0). The per-value pipeline is now coercion → `.sanitize()` (typed transform) → declarative constraints → `.validate()` (sync or async, `true` or an i18n-able message — executed for the first time). The walker covers required (previously a UI-only promise), `maxLength`, numeric and temporal bounds (temporal previously UI-only, now with stored-shape format checks), option membership and selection counts, row counts, and email/url/color/link format checks — replacing the per-factory hand-injected sanitizers on `range`, `color`, `select`, `link`, `richtext`, and `repeater`, so `.sanitize()` is purely the author's transform and can no longer disable a declared constraint. Failures aggregate across the whole patch into `CONFLICT.data.errors` as `{ path, message }` pairs — `path` dot-joins into nested repeater cells (`sections.2.heading`), `message` is a plain string or a message descriptor with its interpolation values — and the admin metabox form pins each onto the addressed input inline (term edit, user edit, and the entry editor's document panel). `sanitizeMetaInput`/`sanitizeMetaForRpc` are now async; sanitize callbacks that throw map to a path-addressed generic invalid error instead of carrying custom reasons (use `.validate()` for custom messages).

- [#1534](https://github.com/withplumix/plumix/pull/1534) [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds conditional field visibility authored from field references: condition factories typed per driving field (`.is()`, `.gt()`, `.isOn()`, containment/count on multi-select) feed `.visibleWhen()`/`.orVisibleWhen()` groups that show/hide admin fields live and skip server-side validation of hidden fields.

- [#1529](https://github.com/withplumix/plumix/pull/1529) [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f) Thanks [@nasyrov](https://github.com/nasyrov)! - New `link()` field on `plumix/fields`: a fluent CTA-shaped value (`{ url, label?, newTab? }`) with the full universal chain and phantom `LinkValue | undefined` typing (narrowed by `.required()`/`.default()`). The value's shape and URL are server-validated on write (site-relative path or WHATWG-parseable absolute URL; unknown properties stripped) ahead of any chained `.sanitize()`. The admin metabox control authors the URL by typing an external URL or picking a public internal entry — resolved to its permalink via the lookup RPC — with a link-text input and an open-in-new-tab switch.

- [#1532](https://github.com/withplumix/plumix/pull/1532) [`1501f42`](https://github.com/withplumix/plumix/commit/1501f42f2431290f5ecdfbe35035948c90733511) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders, part two (breaking, pre-1.0): the remaining eight scalar field constructors on `plumix/fields` — `number`, `range`, `date`, `datetime`, `time`, `color`, `richtext`, `json` — now author as immutable chained builders instead of flat option objects: `number("rating").min(1).max(5).step(0.5)`, `richtext("body").marks(["bold"]).nodes(["heading"])`. Per-type chains expose only the options that apply (`number(...).maxLength(...)` is a compile error); `range` requires `.min()`/`.max()` and enforces `min <= max` at registration; `color` and `range` keep their injected default sanitizers (a custom `.sanitize()` replaces them); `richtext` always injects the allowlist walker and deliberately offers no `.sanitize()`. Removed: the flat `NumberFieldOptions`/`RangeFieldOptions`/`DateFieldOptions`/`DateTimeFieldOptions`/`TimeFieldOptions`/`ColorFieldOptions`/`RichtextFieldOptions`/`JsonFieldOptions` types; `DateMetaBoxField`/`DateTimeMetaBoxField`/`TimeMetaBoxField` are now aliases of `TemporalMetaBoxField<I>`.

  New: `.returns("date")` on `date`/`datetime`/`time` projects the stored ISO string to a JS `Date` at decode time and the inferred read type follows (`Date | undefined`, narrowed by `.required()`/`.default()`); the default read stays the ISO string. Projected `Date`s anchor their wall-clock components to UTC (`date` at UTC midnight, `time` on 1970-01-01 UTC) so they survive any server/browser timezone split — read components back with `getUTC*` or `timeZone: "UTC"` formatting. Symmetrically, temporal fields now accept a `Date` on the write side and store the field's ISO shape from UTC components, so admin round-trips of projected values are lossless; `formatTemporalValue` on `@plumix/core/manifest` exposes the shared formatter.

- [#1531](https://github.com/withplumix/plumix/pull/1531) [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd) Thanks [@nasyrov](https://github.com/nasyrov)! - Consolidates choice fields onto a fluent `select()` builder and adds `toggle()` (breaking, pre-1.0). `select("size").options(["s", "m"])` infers the option literal union as the value type; `.multiple()` flips reads to a readonly array and storage to a JSON array, unlocking selection-count `.max()`; `.appearance("select" | "radio" | "buttons" | "checkboxes")` picks the admin control without changing the value shape, and cardinality-illegal combinations are compile errors in either call order. `toggle()` renders the admin switch with `.onText()`/`.offText()` state labels and reads `boolean | undefined`, narrowed by `.required()`/`.default()`. Removes the flat `radio`, `multiselect`, and `checkbox` factories, their option types, and their wire variants — object literals using the retired `inputType` strings still compile via `LegacyMetaBoxField` and still render. `SelectMetaBoxField` becomes a `multiple`/`type`-correlated union, and the manifest wire carries `multiple`, `appearance`, `onText`, and `offText`.

- [#1527](https://github.com/withplumix/plumix/pull/1527) [`274a97c`](https://github.com/withplumix/plumix/commit/274a97c0c239ba1722965b00620e1ad91b54ef90) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders (breaking, pre-1.0): the five string scalar field constructors on `plumix/fields` — `text`, `textarea`, `email`, `url`, `password` — now author as immutable chained builders instead of flat option objects: `text("subtitle").placeholder("…").maxLength(120)` replaces `text({ key, label, … })`. Labels default to the humanized key; the universal chain adds `.label()` (string or message descriptor), `.description()`, `.placeholder()`, `.prepend()`/`.append()`, `.default()`, `.required()`, `.span()`, `.capability()`, `.showInApi()`, `.sanitize()`, and `.validate()`, with phantom value typing (`string | undefined`, narrowed to `string` by `.required()`/`.default()`). Every `fields` registration surface (entry/term/user meta boxes, settings groups, repeater `subFields`) accepts builders alongside plain field definitions and compiles them at registration. `.span()` is accepted on every surface as a universal layout hint — the `EntryMetaBoxField` span-omit union is gone (the entry editor rail still ignores and strips the hint). Removed: the flat `TextFieldOptions`/`TextareaFieldOptions`/`EmailFieldOptions`/`UrlFieldOptions`/`PasswordFieldOptions` types; the five per-variant field interfaces are now aliases of `StringMetaBoxField<I>`. Repeater rows no longer feed absent (`null`/omitted) subfield values into sanitize callbacks, mirroring top-level deletion semantics.

- [#1538](https://github.com/withplumix/plumix/pull/1538) [`9087ed0`](https://github.com/withplumix/plumix/commit/9087ed0c9dfc720b5b3b135691bade4a9afbe28d) Thanks [@nasyrov](https://github.com/nasyrov)! - Read-time reference hydration is now cache-correct: a page that embeds a referenced entity carries that entity's cache tag and is purged when the entity changes. A per-request accumulator collects tags during hydration and the public read-through folds them into the page's stored cache tags, so editing, deleting, or otherwise changing an embedded entry busts the pages that hydrated it (the entry adapter contributes its precise `e:<id>` tag through the existing purge pipeline). Lookup adapters gain an optional `embeddedCacheTags(payload)` method to declare the tag a hydrated payload contributes; kinds without a per-entity purge identity (e.g. `user`) omit it. A new server-side `hydrateReferences(ctx, kind, ids, { scope })` helper gives themes the same batched adapter path and tag accounting for id-only reference fields, resolving an id set in one in-query per chunk and returning the hydrated payloads dense and in requested order. Pages that hydrate nothing are tagged exactly as before.

- [#1535](https://github.com/withplumix/plumix/pull/1535) [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields hydrate at read time (breaking, pre-1.0). Lookup adapters gain an optional batched `hydrate({ ids, scope })` contract; core's `entry`/`term`/`user` adapters resolve ids into public-safe summary shapes (`EntryReferenceSummary` with title/slug/url, `TermReferenceSummary`, `UserReferenceSummary` — never email/role), and the media adapter resolves a full media item including its URL, so themes can finally render a media meta field. Hydrated shapes are declared per kind in the merged `ReferenceHydrationShapes` registry, augmentable by plugins. The read pipeline (`hydrateMetaBags`, replacing `filterMetaOrphans`) runs hydration and orphan-stripping as one traversal: ids aggregate across all reference fields of all entries in a response and resolve with one in-query per `(kind, scope)` group — public render template data, admin oRPC reads, and REST projection all return hydrated values. Hydration is one level deep (a hydrated entry's own references stay ids), deleted referenced entities read as absent (single refs `null`, multi refs dropped, arrays stay dense), and kinds whose adapter predates `hydrate` keep the plain-id read shape. Unpublished referenced entries are clamped away from viewers without `edit_any` on the referenced type, so public render and anonymous REST never leak a draft's title through hydration. Hydrated values round-trip safely through writes — the sanitizer and the autosave merge heal `{ id, ... }` payloads back to plain ids. Admin reference pickers accept the hydrated object values and keep operating on ids.

- [#1530](https://github.com/withplumix/plumix/pull/1530) [`a55a17c`](https://github.com/withplumix/plumix/commit/a55a17cfb577b8e5f21b428496bd2a0d76b9fffd) Thanks [@nasyrov](https://github.com/nasyrov)! - Typed meta reads (breaking, pre-1.0): declared fields now flow into typed reads everywhere via contribution-keyed registries. Augment `EntryMetaContributions` / `TermMetaContributions` / `UserMetaContributions` (keyed by box id) or `SettingsContributions` (keyed by group name) with `{ entryTypes: "post"; fields: typeof myFields }`, and `MetaOf<K>` / `TermMetaOf<K>` / `UserMetaOf` / `SettingsOf<Name>` fold every contribution targeting `K` into one closed record — a mistyped field name is a compile error in the theme. Targeted templates (`forEntryType(...)`, `forTermTaxonomy(...)`) receive entries and terms with the folded typed `meta` (`ResolvedEntryFor<K>` / `ResolvedTermFor<K>`), and `whereMeta` keys/values are typed against the distinct stored shapes (`StoredMetaOf<K>` / `StoredTermMetaOf<K>` via `InferStoredFields` — `.default()` narrows only the read shape). When a contribution declaration exists for a box id, the matching `register*` call is typechecked against it (target set and fields must match); a missing declaration degrades to absence from the typed record and can be supplied from any package via interface merging. Removed: the `meta` projection slot on `EntryTypeRegistry` / `TermTaxonomyRegistry` — `MetaOf`/`TermMetaOf` no longer read it and no longer fall back to an open `Record<string, unknown>`, so `whereMeta` on a type with no declared contributions accepts no keys.

### Patch Changes

- Updated dependencies [[`7d5d664`](https://github.com/withplumix/plumix/commit/7d5d664dca8c1fb726b9fc7f1607b3ad41d26708), [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a), [`4f5b96a`](https://github.com/withplumix/plumix/commit/4f5b96aeebd75f0dde824fbe763fe7c040094c9c), [`8018aba`](https://github.com/withplumix/plumix/commit/8018aba6d6490f466c253206e41f45b0989f38f8), [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b), [`864aa9a`](https://github.com/withplumix/plumix/commit/864aa9aef5dc3b950c3a65057cb65b9b88e3a797), [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f), [`1501f42`](https://github.com/withplumix/plumix/commit/1501f42f2431290f5ecdfbe35035948c90733511), [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd), [`274a97c`](https://github.com/withplumix/plumix/commit/274a97c0c239ba1722965b00620e1ad91b54ef90), [`9087ed0`](https://github.com/withplumix/plumix/commit/9087ed0c9dfc720b5b3b135691bade4a9afbe28d), [`1609a52`](https://github.com/withplumix/plumix/commit/1609a52c98056fab7e15a4a50963d717ec1d665a), [`9f6a5a8`](https://github.com/withplumix/plumix/commit/9f6a5a8025ba3c1f103473b912f6474045d1f5e5), [`4617ca9`](https://github.com/withplumix/plumix/commit/4617ca9b66873d4c83debe78f8d7f2a3b58e2479), [`f58edfb`](https://github.com/withplumix/plumix/commit/f58edfbfa4d743ec41143366da219160cfc3e9fb), [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b), [`011174b`](https://github.com/withplumix/plumix/commit/011174b37b3015b033191e72426c5b7849c33df2), [`0a185ba`](https://github.com/withplumix/plumix/commit/0a185baf413211727c36971e8880c2a670bede6d), [`538d64d`](https://github.com/withplumix/plumix/commit/538d64d4cf0767f4302e3287ebb8c1b752105027), [`0b8c1c0`](https://github.com/withplumix/plumix/commit/0b8c1c0bb99b630d58bf7e97690d6a9df4a16814), [`3df62e3`](https://github.com/withplumix/plumix/commit/3df62e300348aa90bb8b4a9fd1883adf8e5c03ee), [`a55a17c`](https://github.com/withplumix/plumix/commit/a55a17cfb577b8e5f21b428496bd2a0d76b9fffd), [`e9a14b1`](https://github.com/withplumix/plumix/commit/e9a14b18460915e8aa210047d63f5d6097b3b24a)]:
  - @plumix/core@0.7.0
  - @plumix/admin@0.7.0
  - @plumix/admin-ui@0.7.0
  - @plumix/admin-editor@0.7.0
  - @plumix/blocks@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`f737d54`](https://github.com/withplumix/plumix/commit/f737d54854c422ad564c98649b58c2a259f8322b), [`642dcf6`](https://github.com/withplumix/plumix/commit/642dcf6b2cd42e4f9aca5ddf007dc3f6b1f7f613), [`d6c456a`](https://github.com/withplumix/plumix/commit/d6c456a6bf365f492a7024bf7a83da77d006b8d7), [`4c9205a`](https://github.com/withplumix/plumix/commit/4c9205a8dfadfd9b54983b032e234bf4c7ab9ec8), [`dad17a3`](https://github.com/withplumix/plumix/commit/dad17a3f71a8881b5b5ed1dbd387c0f8d2aa520e), [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3), [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c), [`75ef282`](https://github.com/withplumix/plumix/commit/75ef282365fc02cf9520494e3f757cf5a6879880), [`af1af74`](https://github.com/withplumix/plumix/commit/af1af74a925ea4ba5f8ab1c153a466a13195ad68)]:
  - @plumix/core@0.6.0
  - @plumix/admin@0.6.0
  - @plumix/admin-editor@0.6.0
  - @plumix/blocks@0.6.0
  - @plumix/admin-ui@0.6.0

## 0.5.0

### Minor Changes

- [#1479](https://github.com/withplumix/plumix/pull/1479) [`ff1d101`](https://github.com/withplumix/plumix/commit/ff1d1011486e4de0a97c29acd1de33330299dd6f) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an entry-editor template picker for theme-registered `named` templates. A theme exposes author-selectable templates via `forEntryType("page").named("landing", "Landing Page").template(...)` (shipped in [#1445](https://github.com/withplumix/plumix/issues/1445)); this wires up the missing producer so authors can actually choose one.

  - The editor's Page tab shows a "Template" picker listing the `named` templates registered for the current entry type, plus a "(theme default)" option. The pick is written to the reserved `__plumix_template` entry-meta key via a new first-class `template` field on `entry.update` (`null` clears it) — it bypasses the plugin meta-box sanitizer, which still rejects the reserved key on the `meta` path.
  - The set of named templates per type is surfaced to the precompiled admin through the manifest (`collectNamedTemplates` → `buildManifest` options → `EntryTypeManifestEntry.namedTemplates`), never a direct theme import.
  - The preview overlay now keeps `__plumix_template` when stripping reserved autosave meta, so an unsaved pick drives the preview render. A published entry's saved choice resolves to its template on the public route.

- [#1487](https://github.com/withplumix/plumix/pull/1487) [`a69b39e`](https://github.com/withplumix/plumix/commit/a69b39e2d909f21cb59c287e4a3e90f83e1e9392) Thanks [@nasyrov](https://github.com/nasyrov)! - Add the telemetry consumer contract and split the collection gate off the debug bar. A site operator registers consumers once in app config and receives a JSON-serializable snapshot of every sampled request post-response:

  ```ts
  plumix({
    telemetry: {
      consumers: [
        {
          id: "my-exporter",
          sample: (ctx) => Math.random() < 0.1, // head-sampling; omitted = always
          onRequestEnd: async (snapshot, ctx) => {
            /* envelope + span tree + records + dropped counters */
          },
        },
      ],
    },
  });
  ```

  - The collector core is now always present in production bundles and activates per request iff at least one registered consumer votes yes — with no consumers it stays the no-op and production pays nothing. The debug-bar UI remains dev-only and dead-code-eliminated; in dev it registers as the first consumer.
  - `TelemetrySnapshot` carries a request envelope (`requestId`, `method`, `url`, `status`, `startedAt`, `durationMs`), root spans, timestamped records by namespace, and dropped counters. Delivery rides `ctx.defer` — `waitUntil` on the Cloudflare adapter — so export I/O never blocks the response; a 500 still delivers its snapshot.
  - New public types from `@plumix/core`: `TelemetryConsumer`, `TelemetrySnapshot`, `TelemetryRequestEnvelope`, `TelemetryConfig` (plus the existing span/record types are now exported).
  - The collector no longer source-drops namespaces for disabled debug-bar panels — panel disable stays a render-time filter; data collection is consumer-owned.

- [#1490](https://github.com/withplumix/plumix/pull/1490) [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009) Thanks [@nasyrov](https://github.com/nasyrov)! - Unifies automatic DB query tracing: every query flowing through `ctx.db` — libsql, D1, the demo runtime, and statements inside transactions — now appears in the telemetry snapshot as one `db: <kind>` span with `db.sql`, `db.params` (lazy, JSON-safe), and `db.rows` attributes, regardless of whether core or a plugin issued it.

  - One wrap at client construction per driver: `traceSqlClient` (libsql `execute`/`batch`/`transaction`), a new `traceD1Client` in the Cloudflare runtime (prepared statements, batches, and drizzle's emulated begin/commit transactions — timed for the first time), and the demo Durable-Object proxy callbacks. Batches are one round-trip and one span, carrying per-statement sql/params under `db.batch` and the summed row count.
  - Tracing is unconditional — no `PLUMIX_DEV` gate. Without an active collector (no consumer sampled the request) every span is a pass-through no-op, so production without telemetry consumers pays nothing; with a prod consumer registered, query spans now flow to it.
  - The drizzle-logger half of the old dual mechanism is deleted: `createDebugSqlLogger` is gone from `@plumix/core`, and the Database debug-bar panel renders from query spans (now with per-query durations) instead of the removed record channel. New shared helpers `traceDbQuery`/`traceDbBatch` are exported for runtime adapters.
  - DB connections not obtained from `ctx.db` remain an untraced platform boundary.

### Patch Changes

- Updated dependencies [[`7ddd056`](https://github.com/withplumix/plumix/commit/7ddd056a28538719094263c21c4476ec0e203aa5), [`ff1d101`](https://github.com/withplumix/plumix/commit/ff1d1011486e4de0a97c29acd1de33330299dd6f), [`a69b39e`](https://github.com/withplumix/plumix/commit/a69b39e2d909f21cb59c287e4a3e90f83e1e9392), [`b3ad524`](https://github.com/withplumix/plumix/commit/b3ad5247e8dcfd6c2adaeb03f0e22c8a5b5e530d), [`7455fa6`](https://github.com/withplumix/plumix/commit/7455fa68660a5f9ad85e8c6d5a728c747990289c), [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009)]:
  - @plumix/core@0.5.0
  - @plumix/admin@0.5.0
  - @plumix/admin-editor@0.5.0
  - @plumix/blocks@0.5.0
  - @plumix/admin-ui@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e), [`e96e27d`](https://github.com/withplumix/plumix/commit/e96e27d5b6e378fb049431871386c7dcc643bff1), [`0ad5a4b`](https://github.com/withplumix/plumix/commit/0ad5a4bd85c8a57b2fe4cc6bc8803795775c6140), [`39b02e8`](https://github.com/withplumix/plumix/commit/39b02e8595e2d28291014d47bfa8f65d16f976f2)]:
  - @plumix/core@0.4.0
  - @plumix/blocks@0.4.0
  - @plumix/admin@0.4.0
  - @plumix/admin-editor@0.4.0
  - @plumix/admin-ui@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`4cdb59e`](https://github.com/withplumix/plumix/commit/4cdb59ed70c2d83d5b1461a754970709cba92910)]:
  - @plumix/core@0.3.0
  - @plumix/admin@0.3.0
  - @plumix/admin-editor@0.3.0
  - @plumix/blocks@0.3.0
  - @plumix/admin-ui@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`1ff209a`](https://github.com/withplumix/plumix/commit/1ff209a56b1ed3d78e8a6eedb73ceaec056b588d)]:
  - @plumix/core@0.2.0
  - @plumix/admin@0.2.0
  - @plumix/admin-editor@0.2.0
  - @plumix/blocks@0.2.0
  - @plumix/admin-ui@0.2.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`9467449`](https://github.com/withplumix/plumix/commit/9467449d397f65ede387c83883f46c0f3064cc2f)]:
  - @plumix/core@0.1.4
  - @plumix/admin@0.1.4
  - @plumix/admin-editor@0.1.4
  - @plumix/blocks@0.1.4
  - @plumix/admin-ui@0.1.4

## 0.1.3

### Patch Changes

- [#1358](https://github.com/withplumix/plumix/pull/1358) [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `virtual:plumix/worker-exports` codegen seam so a runtime adapter can contribute named exports — such as a Durable Object class — to the generated Cloudflare worker via `RuntimeAdapter.workerExports`. Core never learns about any specific feature; the seam is reusable by any future Durable Object, queue, or realtime adapter.

  The `auth.session` procedure now resolves the current user through the configured authenticator instead of a hardcoded session cookie, so custom authenticators (SSO, the demo sandbox) report the signed-in user on boot. The default cookie-backed behavior is unchanged.

- Updated dependencies [[`c37b6db`](https://github.com/withplumix/plumix/commit/c37b6dba1913322aabc85e9b2876b433efe73351), [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756)]:
  - @plumix/core@0.1.3
  - @plumix/admin@0.1.3
  - @plumix/admin-editor@0.1.3
  - @plumix/blocks@0.1.3
  - @plumix/admin-ui@0.1.3

## 0.1.2

### Patch Changes

- [#1330](https://github.com/withplumix/plumix/pull/1330) [`40cf6e6`](https://github.com/withplumix/plumix/commit/40cf6e627521269d8ea5947c86c99fc47447b6b2) Thanks [@nasyrov](https://github.com/nasyrov)! - Deduplicate the admin's Tailwind `@theme` token mapping. `@plumix/admin` now
  owns it as `theme.css` and ships it in `dist`; plumix's per-plugin CSS sidecar
  reads it from the installed admin package instead of keeping its own hand-synced
  copy. No public API change.
- Updated dependencies [[`40cf6e6`](https://github.com/withplumix/plumix/commit/40cf6e627521269d8ea5947c86c99fc47447b6b2), [`b493fbb`](https://github.com/withplumix/plumix/commit/b493fbb4b3cefec54322ea54023129b4ce1d1139), [`56a4d4a`](https://github.com/withplumix/plumix/commit/56a4d4a4351aafe1468897b2e1f5da1bd5175edb)]:
  - @plumix/admin@0.1.2
  - @plumix/core@0.1.2
  - @plumix/admin-editor@0.1.2
  - @plumix/blocks@0.1.2
  - @plumix/admin-ui@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`843a184`](https://github.com/withplumix/plumix/commit/843a184ea755722f5b9d83664574eaf6ada97045)]:
  - @plumix/core@0.1.1
  - @plumix/admin@0.1.1
  - @plumix/admin-editor@0.1.1
  - @plumix/blocks@0.1.1
  - @plumix/admin-ui@0.1.1
