# @plumix/core

## 0.20.0

### Minor Changes

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

- [#2136](https://github.com/withplumix/plumix/pull/2136) [`823aab7`](https://github.com/withplumix/plumix/commit/823aab7e431fffa67001e7e4b8cbb2f32683e9f3) Thanks [@nasyrov](https://github.com/nasyrov)! - Public search now matches an entry's excerpt as well as its title, so a visitor searching a phrase
  from an article's opening paragraph finds the article instead of an empty page. Entry-type search
  exclusion, published-only results, and pagination are unchanged.

- [#2153](https://github.com/withplumix/plumix/pull/2153) [`ee5d2b7`](https://github.com/withplumix/plumix/commit/ee5d2b74765a7d2b0931aecbc5805cbe6ef58ff4) Thanks [@nasyrov](https://github.com/nasyrov)! - A search whose index is missing now degrades instead of failing.

  The FTS5 index is the half of the plugin's schema no drizzle migration can describe, so it is the half
  that can genuinely be absent: a raw SQL migration that was never applied, a restored dump, an install
  before its first scheduled run. Until now a visitor met that as an error page.

  A search that finds no index answers from core's own vocabulary instead — each word of the query matched
  as a substring of the entry's title or excerpt — and creates the index behind the response, so the next
  search is a real one again. The repair is deferred rather than awaited: it ends in a rebuild, which is
  proportional to the corpus, and the visitor holding the degraded page already has their answer. It is
  also idempotent without a lock, because D1 has none and two requests can arrive on the same missing
  index.

  What is worse in the meantime is worth knowing: a word only an article's body holds is not found, no
  snippet is highlighted, results carry no score, and topics are missing entirely, since core's page has
  never returned them. A missing table that is not the index is still an error, so a schema broken some
  other way is reported rather than quietly answered from half a query.

  Core exposes `tokenizeSearchQuery` and `entrySearchCondition` from `plumix/db` for this — how a query
  parses, and what matching a term against title and excerpt means — so a plugin replacing the search page
  can degrade to core's own query rather than restate it and drift.

  The repair also covers an index whose objects exist but hold nothing, which is what an interrupted repair
  leaves behind: creating the virtual table and filling it are two statements, and a check on
  `sqlite_master` alone would call that healthy for good. Left alone it is not a quieter search but a
  corrupting one — the next update to a row the index never held tells FTS5 to unindex terms that are not
  there.

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

- [#2140](https://github.com/withplumix/plumix/pull/2140) [`6848efd`](https://github.com/withplumix/plumix/commit/6848efd2ebdcffa771ffad4238e46d869dd55664) Thanks [@nasyrov](https://github.com/nasyrov)! - Corrects which entry writes reach the change feed.

  Revisions and autosaves are rows in `entries` under reserved types, so the feed's triggers recorded
  them alongside real content. An autosave rewrote a feed row on every debounced save in the editor,
  pruning a revision past `maxRevisions` emitted a spurious tombstone, and the id on those rows is a
  snapshot's rather than a document's — a consumer resolving one would have read back a revision, or
  indexed an unpublished autosave draft. The triggers now skip reserved types. Filtering there rather
  than in each consumer is what makes the tombstones right: a tombstone carries only an id, and once
  the row is gone nothing downstream can tell a pruned revision from a deleted entry.

  The guard also watches `type`, `slug` and `parent_id` now, alongside title, content, excerpt and
  status. Those three decide an entry's permalink, its template, and whether search indexes it at all,
  so a retype or a slug rename left every consumer holding a projection it had no way to know was
  stale. One consequence worth knowing: `parent_id` is `on delete set null`, so deleting a parent
  re-roots its children and each of them is recorded — a URL change the application never writes.

  Existing installs pick this up through a second migration — a migration the journal already carries
  is never re-emitted, so correcting the first one takes a new one. Run `plumix migrate generate`.

- [#2135](https://github.com/withplumix/plumix/pull/2135) [`155123e`](https://github.com/withplumix/plumix/commit/155123eddb77981d3391f60957d312950515f5af) Thanks [@nasyrov](https://github.com/nasyrov)! - Filtering the entries list no longer matches the stored content envelope. The `LIKE` clause covered `entries.content`, whose JSON keys, block names and attribute names read as prose to a substring match, so `image`, `text`, `code` and a dozen other structural words returned most of the table. Search now runs over `title` and `excerpt`, the two columns that hold prose. Quoted phrases, `-excluded` terms and escaped wildcards are unchanged.
- Updated dependencies [[`15b7cc9`](https://github.com/withplumix/plumix/commit/15b7cc993bb94b9e4ee9c7eb1223efa049225f29), [`36723db`](https://github.com/withplumix/plumix/commit/36723db2903a0156a12b598a62755d2d5cf25e41)]:
  - @plumix/blocks@0.20.0

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

- [#2107](https://github.com/withplumix/plumix/pull/2107) [`18140f3`](https://github.com/withplumix/plumix/commit/18140f33c37fb346dc297179fe01f2792d41a350) Thanks [@nasyrov](https://github.com/nasyrov)! - Sets a retention period once for the whole site, and stops the nightly purge reading the whole table to find the tail it deletes.

  `forms({ retentionDays: 90 })` is now the period every form keeps its submissions for, so a site says once how long it is entitled to what its forms collect instead of repeating the number on each of them. A form declaring its own period still keeps that one, `0` included — on a form that is a declaration rather than an absence, and so the way one form opts out of a period the site set for the rest. Both default to keeping submissions indefinitely, which is the only default that cannot lose an enquiry nobody asked to lose.

  The nightly sweep now bounds each form by `id` as well as by date. `created_at` is in no index, so the old condition read the whole table — one form's arm walking that form's entire backlog, and several arms OR'd together dropping to a plain scan. Measured on 200,000 rows across three forms, it read all 200,000 to delete 703, and read all 200,000 again on a night with nothing to purge at all. It now reads 1,409 and 3. No index was added — a `(form, created_at)` one would have cost a b-tree insert on every submission and made the inbox's date-range filter 65× to 2,633× more expensive, for a further 2×.

  Ids are arrival order for every row the plugin writes, since a submission takes the column's `unixepoch()` default. A row backdated by a direct write to `form_submissions` or by an import sits outside that order: it is kept rather than deleted, and goes once the rows stored before it have expired too.

  The sweep also counts what it deleted off the driver rather than asking for every deleted id back. The first sweep after a site sets a period is unbounded, and 200,000 ids cost around 106 MB of heap to measure a number the driver was already holding — against a Worker's 128 MB limit. `plumix/db` exports the `rowsAffected` helper this needs, which reads the count off libsql's `rowsAffected`, D1's `meta.changes`, or a top-level `changes` for better-sqlite3, node:sqlite and bun:sqlite. It throws for a driver that reports no count at all rather than logging a zero it cannot stand behind — the demo runtime's `sqlite-proxy` adapter is one, though it registers no scheduled tasks for the purge to run under.

  `FormDefinition.retentionDays` is now `number | undefined` rather than `number`, since a form that declares no period is no longer the same thing as one that declared zero. Code reading the period off a definition should read it off the registry's `retentionDaysFor` instead, which folds in the site's own.

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

- [#2056](https://github.com/withplumix/plumix/pull/2056) [`9ebc490`](https://github.com/withplumix/plumix/commit/9ebc4901f8ad99101904901a2543ce3c32a3f695) Thanks [@nasyrov](https://github.com/nasyrov)! - Lets a condition apply inside a repeater row or a group, judged against that row's or group's own
  values.

  `.visibleWhen()` was refused on a sub-field at registration, because nothing evaluated it one scope
  down: the admin rendered every sub-field regardless, and the write pipeline validated every cell. A
  row whose `kind` decides which siblings apply had to show all of them at once — a row of kind
  "Text" offering the "Choices" list that belongs to "Dropdown".

  Both evaluators now read the row's or group's own bag, so `repeater("fields").fields([kind,
text("choices").visibleWhen(kind.is("select"))])` registers and behaves the way the same chain does
  on a box's fields: the admin shows and hides sub-fields live as the author changes the driver, and
  sibling rows never speak for each other. Registration still refuses a rule that names anything
  other than a sibling — a row cannot read a box-level key, so such a rule could never pass — and
  `sub_field_condition_unknown_driver` reports that mistake in place of the removed
  `sub_field_condition_not_supported`.

  On save a hidden cell runs under the same rules a draft does. Business constraints cannot fail on
  it, so a `.required()` sub-field behind a false condition can no longer block a publish with an
  error pointing at an input nobody can open; coercion, `.sanitize()` and the safety gates still run,
  and the value itself is kept. Keeping it matters more here than at box level, where a hidden key's
  stored value is simply left alone: a row is rewritten whole on every save, so a cell dropped once
  would be gone for good — including on a publish that re-runs rows the author never touched.

  Visibility inside a row reads an absent driver key as unset rather than unknown, which is what the
  admin does when it renders the same row. The box-level rule differs on purpose: a patch there may
  legitimately omit a driver, while a row is always written complete.

### Patch Changes

- [#2110](https://github.com/withplumix/plumix/pull/2110) [`4d09ee2`](https://github.com/withplumix/plumix/commit/4d09ee28b8f2f8a7dd6bcd320baf8171cf6b1df0) Thanks [@nasyrov](https://github.com/nasyrov)! - Counts the sessions the nightly cleanup reaped off the driver instead of reading every deleted row back.

  `pruneExpiredSessions` asked SQLite for the id of each row it deleted purely to take `.length` of the result. On a site whose sessions have been accumulating — the cleanup only runs where the deploy declares the matching `triggers.crons` entry, so a deploy that adds one later reaps the whole backlog on its first night — that is a row of heap per expired session to measure a number the driver was already holding. It now reads the count off `rowsAffected`.

  That trades portability for the heap: `returning()` answered on every driver, and `rowsAffected` throws on one that reports no count. The demo runtime's `sqlite-proxy` adapter is the only such driver in the box, and it registers no scheduled tasks, so nothing in a Plumix deploy reaches the throw. A third-party runtime on an exotic driver would, and should read the rows back itself.

- Updated dependencies [[`286d0fd`](https://github.com/withplumix/plumix/commit/286d0fd1466a39504452df07008bffc16b2333ef), [`de0f56f`](https://github.com/withplumix/plumix/commit/de0f56ff7a5e96b896c9e4c81ac2f277e873cd9f), [`a74cf73`](https://github.com/withplumix/plumix/commit/a74cf731f9dd5809f12961bc1ed9a989ab1f9a08)]:
  - @plumix/blocks@0.19.0

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

- [#2041](https://github.com/withplumix/plumix/pull/2041) [`8e5776b`](https://github.com/withplumix/plumix/commit/8e5776b48f2b58152b0c668860258e20a51eeb9d) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `pageFacts`, which normalizes a render payload into what the page _is_ — its kind, 1-based
  pagination index, published and modified timestamps, author, term and entry — so a plugin reasoning
  about a page reads core's own answer instead of re-deriving it.

  The read discriminates on the payload's `kind` rather than on field presence. A plugin archive
  (`CustomArchiveData`) carries whatever fields its author likes, so an `"entry" in data` check would
  happily read one plugin's field as core's subject; every field a page does not have comes back
  null.

  Core's head assembly now takes its description, `og:type` and search-page handling from `pageFacts`
  rather than restating the same checks inline. The rendered head is unchanged.

  Also exports `xmlEscape`, so a plugin serializing a feed or a sitemap does not ship its own copy of
  the five-character table.

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

### Patch Changes

- Updated dependencies []:
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

- [#2036](https://github.com/withplumix/plumix/pull/2036) [`f169434`](https://github.com/withplumix/plumix/commit/f1694341ec80ac99e9f31243605f35fbb7c6f823) Thanks [@nasyrov](https://github.com/nasyrov)! - The bundled default card now covers every page kind core routes, not just entries. Install the
  plugin, configure nothing, and a term archive, a content-type archive, an author archive, a date
  archive and the front page each get a card — the page's own title over the site's name, and on the
  front page the site's name over its tagline. A card a theme declares still outranks it.

  Cards moved to `/_plumix/og/card/<target>/<digest>.<ext>`, where `<target>` names the page:
  `entry/12`, `term/3`, `archive/post`, `author/7`, `date/2026-03`, `front-page`. One route mount
  serves all of them, so the kind is a path segment rather than a route of its own. The digest-less
  pointer is unchanged in behaviour — `/_plumix/og/card/term/3.png` redirects to whichever render is
  current.

  A listing page is shareable when it lists at least one published entry, and answers `404` when it
  does not — the same way the entry route answers for a draft. That rule is what keeps a card from
  being minted for every date in the calendar, and keeps `author/<id>` from being a walk through the
  user roster on a site where nobody has published. The front page is the exception: it is the site,
  so it is shareable whether or not anything is on it yet. A search page and a `registerArchiveType`
  archive get no card at all — neither can be named by an identity a URL could carry.

  A content-type archive is asked one thing more: whether an anonymous visitor may read it.
  `policyForMatch` resolves an `archive` intent against the entry type's `access.default`, so a type
  whose listing page redirects a signed-out visitor to sign-in now gets no card either — the same
  question the entry route already asked, on the page kind that can also carry other entries' titles.

  A card names the archive rather than one paginated slice of it. `/posts/page/2` advertises the same
  card `/posts` does: the route only ever renders an archive's first page, so the head resolves that
  page too rather than digesting a slice the route will not serve.

  `resolveListingPage` is a new core export: it resolves the front page, an archive, a term, an
  author or a date archive from its identity rather than from a URL, returning the node and the data
  that page's own template would receive. The card route reads through it, so a card is rendered from
  the same query the page is — filters included — rather than from a second copy of it. Public
  date-archive routes now answer one `x-plumix-hint` (`public-date-not-found`) where they answered
  two, since an unparsable date and a page past the end of a real one are one missing page.

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

- [#1993](https://github.com/withplumix/plumix/pull/1993) [`5b30da7`](https://github.com/withplumix/plumix/commit/5b30da79f79563e1578bc940f46fd26836570287) Thanks [@nasyrov](https://github.com/nasyrov)! - Cards now cache at the edge and invalidate through the machinery pages already use. The card route
  takes core's plugin-route read-through, and stores its response under the tag the card's own `key`
  emitted — for an entry card, the `e:<id>` tag `entry:published` already sweeps. One caching story
  for the page and for the card it advertises, rather than two. A card keyed with `cardKey.of` is
  tagged in an `og:` namespace instead, since only its author knows what it read; nothing purges
  those, and the URL is what invalidates them.

  A card URL now carries the card's digest — `/_plumix/og/card/entry/<id>/<digest>.<ext>` — and is served
  `public, max-age=31536000, immutable`. That is the point of the tag purge being belt and braces
  rather than the mechanism: purging reaches Cloudflare and stops there, while the image caches X,
  Facebook and LinkedIn keep hold an `og:image` by URL for weeks, so the only lever on them is
  publishing a URL they do not have. An edit produces one. The digest-less URL still resolves —
  `/_plumix/og/card/entry/<id>.<ext>` redirects to whichever render is current — which is how you open a
  card by hand, and a URL an edit has superseded redirects there too rather than 404ing on a scraper.

  Cards carry no audience-segment axis. The session and locale cookies are scoped to `/_plumix/`, so a
  signed-in visitor's browser does send them to the card route — and `Accept-Language` counts on that
  path too. Every card therefore renders in the site's own locale rather than the visitor's: otherwise
  a scraper sending `Accept-Language` would digest a URL the head never published and be redirected
  away from its image, and a card reading the locale without naming it in its key would freeze
  whichever locale asked first into bytes no purge can reach. A query string is refused rather than
  ignored, since the edge keys on the whole URL. The response carries no `Vary` and no `Set-Cookie`.

  Core gains `tagCacheEntry(ctx, tags)` for this: a `cacheable: true` route is the only party that
  knows what its own response read, so it names its tags in the same `t:<type>` / `e:<id>` vocabulary
  core purges by. A route that names none still stores untagged, exactly as before.

- [#2008](https://github.com/withplumix/plumix/pull/2008) [`3a7c64a`](https://github.com/withplumix/plumix/commit/3a7c64a56238e148af7088f28e447acca9b4ab79) Thanks [@nasyrov](https://github.com/nasyrov)! - An author can see what a post will look like when it is shared, before publishing it. Name the entry
  types that should carry it — `og({ preview: ["post", "page"] })` — and each one's editor gains a
  **Social card** box: the image the entry will actually be shared with, a line naming which of the
  four links of the `og:image` chain produced it, and — where no card was generated — the reason, in
  the same vocabulary the debug bar's og panel reads. "I set a featured image and the preview did not
  change" now reads back as _The card steps aside for the featured image_.

  The preview renders on request and reads nothing back from storage, so a draft has one too — which
  is the point, since a card's URL is addressed by a digest over what the card read, and a draft has
  no stable one while an entry under edit moves out from under it. It overlays the caller's pending
  autosave the way `entry.get`'s preview mode does, because on an entry type supporting autosave a
  _published_ entry's meta edits land on a per-user draft row — so a featured image picked on a live
  post shows up here before it is published. The bytes travel back inline from a plugin procedure
  gated on the entry's own edit capability; with a `remote()` renderer connected the card's content
  also reaches that endpoint, which is the operator's own service.

  An entry no scraper could reach — a private type, or one an access policy gates — gets no card in
  the preview either. Only the _status_ half of that check is skipped, since showing a draft is the
  point; skipping the rest would name a link the page will never use.

  It previews; it does not choose. There is no per-entry override, no template picker and no mode
  select: the chain is the one precedence authority, and adding a fifth control before authors can
  see the outcome is backwards. When per-entry control does arrive it has to become that authority
  rather than sit beside it.

  The list of entry types is not defaulted. A meta box is registered against entry types by name and
  a name nothing registered fails the boot, so a guess here would crash a site for installing a
  plugin; left out, neither the box, the procedure behind it, nor the plugin's admin chunk is
  registered.

  Core exports three helpers this needs, each the seam core itself reads through: `entryRoleImage`
  (the role links of the same chain, so a subscriber that has to say where an image came from is not
  re-deriving them and matching URLs against the result), `loadSiteSettings` (the request-memoized
  `site` bag, so asking for one setting joins the read the head defaults already made), and
  `getAutosave` (the caller's pending draft of an entry).

- [#1991](https://github.com/withplumix/plumix/pull/1991) [`f5d786a`](https://github.com/withplumix/plumix/commit/f5d786ad6fa0341e6c72c12f011ada40204470fc) Thanks [@nasyrov](https://github.com/nasyrov)! - Moves the `seo:og_image` filter above the entry's `.featured()` image, so a
  generated social card can outrank the entry's own photo when a theme asks it
  to. The filter's incoming value stays `null` — returning it, or returning
  `null` from a page a subscriber does not handle, leaves the photo exactly where
  it was — and the photo is passed as a fourth argument instead, so a subscriber
  can improve on it (crop it to a card's shape) rather than only replace it. An
  explicit `.ogImage()` role still short-circuits above everything. The one
  behaviour change: an image a subscriber returns now outranks `.featured()`,
  where before the photo won unconditionally. `OgImage` is exported for
  subscribers that name the type.

- [#1983](https://github.com/withplumix/plumix/pull/1983) [`1c67995`](https://github.com/withplumix/plumix/commit/1c67995236f52b0c01a3594d7eab3746191cac5d) Thanks [@nasyrov](https://github.com/nasyrov)! - Emits generated cards into the page head.

  An entry's page now carries its card as `og:image`, with `og:image:width` and `og:image:height` alongside it, so a scraper lays the preview out before it fetches the bytes. The size comes off the card rule the route would resolve, so a theme card declaring its own dimensions is reported at those. The card sits one link below an author's own `.ogImage()` / `.featured()` choice and one above `site.default_og_image`: it beats a generic image and never overrides a deliberate one.

  Cards are PNG by default — around 27 KB for a representative card — with `takumi({ format: "jpeg" })` for a photo-heavy design. The route's extension always names the format behind it.

  What reaches the head is decided by what the renderer declares it produces, not by a flag of its own. `svgOnly()` still serves its route, so you can build and look at cards with no rasterizer, but SVG is never advertised: it unfurls as nothing on X, Facebook and LinkedIn, which is worse than your site's default. A render that throws redirects to that same default and logs, rather than answering an error status the head already promised an image for — and in development it surfaces on the dev error page with its stack.

  Core change behind that last part: a throw from anything mounted under `/_plumix/` — a plugin route above all — now reaches the dev error page in development, where it previously returned an opaque `internal_error` JSON body. Production is unchanged.

- [#1971](https://github.com/withplumix/plumix/pull/1971) [`ce79cc1`](https://github.com/withplumix/plumix/commit/ce79cc17a931bcd5809bad80c71ebcaaed473cd2) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `resolveRule` and `resolveErrorRule`, the template-hierarchy precedence
  walk generalised over any rule carrying a `tier` and a `match` — targeted
  matchers in declaration order, then the node kind's generic tier, then
  `fallback`. The rule's payload never entered that walk, so a rule kind whose
  payload is not a React component now resolves through the same logic instead of
  reimplementing it; the new `TierMatchRule` type names the constraint, and the
  resolved rule comes back at the caller's own type. `resolveTemplate` and
  `resolveErrorTemplate` are unchanged, and are now these two pinned to
  `TemplateRule`.

- [#1978](https://github.com/withplumix/plumix/pull/1978) [`d4f1001`](https://github.com/withplumix/plumix/commit/d4f10014d60ec42ee40afbe12217b6e0cd810690) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an edge-cache opt-in for plugin routes: `registerRoute({ cacheable: true })` serves a public
  raw route through the edge cache instead of running its handler on every request. A response that
  sets its own `Cache-Control` now keeps that freshness through storage — an immutable
  content-addressed asset stays immutable — and the configured page TTL applies only to responses
  that set none.

- [#1984](https://github.com/withplumix/plumix/pull/1984) [`e581fcf`](https://github.com/withplumix/plumix/commit/e581fcf310170f9a12f6dd264879c851ef08b0d1) Thanks [@nasyrov](https://github.com/nasyrov)! - Refuses a social card for an entry the access layer keeps from anonymous visitors.

  A card carries the entry's title, sits at a sequential id anyone can walk, and is served from a shared cache. It was gated on publication status and the entry type's `isPublic` alone, so an entry behind an `access` policy — one whose page redirects a signed-out visitor to sign-in, or answers a 402/403 — still had a card at `/_plumix/og/card/entry/<id>.<ext>`. The route now asks the access layer too, and answers `404` when the page is gated.

  The head asks the same question, so it never advertises a URL the route refuses — including on a page rendering for a signed-in visitor who _can_ read it, since the scraper that follows the URL cannot. A _soft_ gate keeps its card on purpose: that page serves a public teaser at 200, so the teaser is meant to unfurl.

  Core gains `entryAllowsAnonymousAccess(ctx, entry)`, which resolves an entry's effective policy — the type's `access.default`, or the per-entry choice that overrides it — against an anonymous principal and reports whether the page renders. Anything publishing a public artefact on an entry's behalf can now ask the same question its page does, rather than approximating it.

  A `?preview=` render also reports the entry's per-entry access choice correctly now. The autosave overlay stripped the reserved key, so a template read the type default rather than the choice actually gating the entry — and unlike the template pick, an unsaved access pick must not drive the preview, because the gate resolves its policy from the persisted row.

- [#1975](https://github.com/withplumix/plumix/pull/1975) [`0390823`](https://github.com/withplumix/plumix/commit/0390823543fb23edf83c8df54671cb7933c9a51f) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `serveRenderedAsset`, a read-through primitive for bytes that are expensive to produce: a
  route hands it a storage key, a content type and a render function, and gets back a response.

  A storage hit streams straight back, a miss renders once and persists, and a matching
  `If-None-Match` answers 304 without a body. With no `storage:` slot configured the asset still
  renders and serves — correct, only uncached. Responses carry the content type, the byte length,
  `x-content-type-options: nosniff`, and `cache-control: public, max-age=31536000, immutable` unless
  the caller sets its own freshness.

  The key is content-addressed by contract: fold every input that changes the output into it, so a
  changed input lands on a new key rather than needing an invalidation pass. The ETag derives from
  that key rather than from the payload or the storage backend, which is what lets revalidation
  match — a digest minted on the render path could never agree with the ETag a backend mints for the
  same bytes.

- [#1985](https://github.com/withplumix/plumix/pull/1985) [`86deb49`](https://github.com/withplumix/plumix/commit/86deb49d04e398de9ded95844ace7a8594d254bd) Thanks [@nasyrov](https://github.com/nasyrov)! - The tier and matcher vocabulary a theme selects with is now defined once. `forEntryType`,
  `forTermTaxonomy`, `forAuthor`, `forDate` and `forArchiveType` — their `.slug()` / `.id()` /
  `.whereMeta()` / `.where()` chains, the `archive` sub-selector and the matchers they mint — are
  built from `entryTypeTargets`, `termTaxonomyTargets`, `authorTargets`, `dateTargets` and
  `archiveTypeTargets`, which core now exports. A plugin declaring its own rule kind against the
  node hierarchy composes its selectors out of those rather than restating core's matchers, the way
  it already resolves them through `resolveRule`. No change to what the template builders accept or
  produce.

- [#1974](https://github.com/withplumix/plumix/pull/1974) [`9950906`](https://github.com/withplumix/plumix/commit/9950906203c3174ff99e9fe48f196b64754b1fb8) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds a `seo:og_image` filter so a plugin or site can supply a page's social
  image, and emits `og:image:width`, `og:image:height` and `twitter:image`
  alongside `og:image`. The filter sits between an entry's role-tagged image
  (`.ogImage()`, then `.featured()`) and the site-wide default, so it never
  overrides an author's explicit choice. A template that declares its own
  `og:image` keeps the whole group — no size or `twitter:image` is appended
  beside it.

- [#1972](https://github.com/withplumix/plumix/pull/1972) [`c5945d4`](https://github.com/withplumix/plumix/commit/c5945d4e055b53d546aa87a9bdf4f9c0e9384f91) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `theme:ready`, a boot-time action that hands a plugin the theme's own descriptor.

  Plugins could not read what a theme declared. Plugin setup runs before the theme is looked at, and
  the descriptor sat on the app without ever being offered to anyone — block, mark and shortcode
  registries reached plugins only because core pre-aggregated each one itself, which requires core to
  know what it is aggregating.

  `buildApp` fires `theme:ready` once, right after plugins install and before core assembles any
  registry. A subscriber reads the field it cares about, keeps whatever it needs of its own, and
  carries anything request-scoped through the existing `extendAppContext` — the theme itself never
  joins the request context. Because the handover runs ahead of core's aggregation, a subscriber that
  registers off the back of what it read (a shortcode, a route, a `theme:document` filter) is still in
  time for every registry below it.

  Core names no field on the descriptor. A plugin adds one by augmenting `ThemeDescriptor` through the
  single `declare module "plumix"` specifier, the same way every other plumix registry is extended.

  Note that the handover fails soft, as every action does: a subscriber that throws is reported through
  the action-failure path and boot continues, leaving that plugin's own registry unpopulated.

- [#1982](https://github.com/withplumix/plumix/pull/1982) [`d3c61bf`](https://github.com/withplumix/plumix/commit/d3c61bfa26d2a9cd1b02a4d61a912148e414189b) Thanks [@nasyrov](https://github.com/nasyrov)! - Themes declare their own social cards. An `ogCards` array sits beside `templates` and takes the
  same tier and matcher vocabulary — `card.forEntryType("post")`, `card.entry()`, `card.fallback()`
  — resolved through core's shared rule resolver, with a registered type name narrowing the entry
  data in both callbacks and a typo failing to compile. Every rule states what its card read through
  a required `key`, and `cardKey.entry` / `cardKey.of` emit the URL hash and the purge tag from one
  call. The card's own source and the active font set fold into the key, so a redesign or a swapped
  face invalidates without a version bump. A declared card outranks the plugin's bundled default.

  Core exports `loadTemplateDeps`, so a rule kind that is not a template can load the deps it
  declares.

- [#2031](https://github.com/withplumix/plumix/pull/2031) [`107724d`](https://github.com/withplumix/plumix/commit/107724d272cf534946443eb567848949c4ca3eaa) Thanks [@nasyrov](https://github.com/nasyrov)! - Rejects a `rewrite.slug` the router cannot compile into a safe route.

  `registerEntryType` / `registerTermTaxonomy` took any `rewrite.slug` and put it straight into a
  `URLPattern` at boot, so two shapes failed quietly. A slug with a `/` in it compiled and its archive
  rendered, but the feed router reads only the first path segment when it matches
  `/<taxonomy>/<term>/feed`, so term feeds under a nested base stopped resolving with no error
  anywhere. A slug carrying URL-pattern syntax was worse: `":anything"` or `"*"` widened the compiled
  rule into `/:anything/:slug`, which matches every two-segment URL on the site and swallows other
  plugins' pages.

  The slug now gets the same single-segment check `hasArchive` already had — one lowercase segment
  matching `/^[a-z0-9][a-z0-9-]*$/` — and an invalid one throws at boot, naming the registration and
  the offending slug, instead of starting a site with a hole in it.

  The empty string stays legal for an entry type, where it mounts the type at the URL root — that is
  how `@plumix/plugin-pages` serves `/about`. A taxonomy has no root form, so `""` is rejected there
  rather than compiling to `//:term`.

  The hazard was reachable by any plugin, but `blog({ post: { rewrite: … } })` made it reachable from
  a site's own config, so the caveat that documented it is deleted rather than copied into the next
  configurable plugin.

### Patch Changes

- Updated dependencies [[`228ef18`](https://github.com/withplumix/plumix/commit/228ef184588c7815a029f51bb764a15de022dde7), [`2a81bf2`](https://github.com/withplumix/plumix/commit/2a81bf24a2d163e8cc3965770ed9bdae9afd5a2e)]:
  - @plumix/blocks@0.17.0

## 0.16.0

### Minor Changes

- [#1936](https://github.com/withplumix/plumix/pull/1936) [`1a475b5`](https://github.com/withplumix/plumix/commit/1a475b599314a315a850832fd59f0cedec22e675) Thanks [@nasyrov](https://github.com/nasyrov)! - Runs `settings.upsert` through the field pipeline, so a settings value is decoded on the way in
  rather than type-checked one read at a time on the way out.

  `settings.value` was `unknown` on the column because a value reached it straight off the RPC without
  passing any pipeline — nothing had proved its shape, so every reader narrowed it by hand. Keys a
  registered group owns now take the same write path as entry and term meta (coercion, `.sanitize()`,
  the declared constraints); keys nobody registered keep the laissez-faire write but still have to be
  JSON. The column, `SettingsBag`, and the `settings.get` / `settings.upsert` bags now say so, as does
  `SiteSettings` in `@plumix/blocks`, which is the same bag one hop downstream.

  Three consequences for callers. A registered field's declared constraints are enforced where they
  previously were not: a `number("per_page").max(50)` rejects `99` instead of storing it, and the
  rejection arrives as a `CONFLICT` with `reason: "settings_invalid_value"` carrying the same
  `{ path, message }` error list the meta write path returns — the settings card pins each one on the
  input it addresses, as the entry and term forms already did. A value arrives in its declared shape:
  the string `"10"` on a number field lands as `10`. And clearing a key a registered field marks
  `.required()` is refused rather than silently deleted, which is what the same `null` already meant on
  entry and term meta.

  The meta pipeline's own scalar coercion decodes with valibot instead of hand-written `typeof`
  ladders, and `.sanitize()` output is decoded on the same terms as its input. The descriptor types a
  callback's return as `JsonValue`, but nothing enforced that at runtime: a callback handing back a
  `Date` used to reach storage as one and become whatever `JSON.stringify` made of it later. Three
  edges move with it, all of them reachable only from a callback that ignores its declared return
  type. Returning `undefined` still means "write nothing", but now short-circuits the remaining
  constraints instead of running them against a value there is none of — on a `link()` or `color()`
  field that turns a rejected write into a skipped one. Returning `null` from a `string` / `number` /
  `boolean` field's callback is `invalid` rather than stored as `null`. And returning a value the
  field's declared type cannot hold is `invalid` rather than stored.

- [#1950](https://github.com/withplumix/plumix/pull/1950) [`f9b705f`](https://github.com/withplumix/plumix/commit/f9b705f4e423aea61cbdb13e9c2b3ca86a544257) Thanks [@nasyrov](https://github.com/nasyrov)! - Runs Playwright with parallel workers on CI unless the suite shares a database.

  `definePlumixE2EConfig` set `workers: 1` whenever `process.env.CI` was present. The only reason ever
  written down is narrower than that: a playground drives one mutable D1, so its tests race across
  workers and each would restore the baseline mid-run. `hasSharedDb` already says exactly that, and is
  now the only thing that pins a suite. A suite that passes no `playground` — or `applyMigrations:
false`, which is how a playground says it builds its database per session — runs at Playwright's
  default concurrency instead.

  A downstream suite that turns out to need serial execution for some other reason should say so with
  `workers: 1` in its own config, rather than inheriting it from the environment.

### Patch Changes

- [#1929](https://github.com/withplumix/plumix/pull/1929) [`b2b6510`](https://github.com/withplumix/plumix/commit/b2b6510460703249f17dcd0ba676dab3b7ef2caa) Thanks [@nasyrov](https://github.com/nasyrov)! - Narrows the two user-meta bags on the public surface to `JsonObject`, and gives the framework's
  remaining open dictionaries names.

  `AuthenticatedUser.meta` and its `@plumix/blocks` mirror `RendererUser.meta` were
  `Record<string, unknown>`. Both are the `users.meta` column read straight off the row, and that
  column has been `JsonObject` since the storage migration — the projection just never followed. A
  custom `RequestAuthenticator` that builds an `AuthenticatedUser` from a bag typed
  `Record<string, unknown>` now has to say `JsonObject`; reading `ctx.user.meta` is unaffected.

  Everything else here is a rename. The bags that are genuinely not serialized data — logger metadata,
  a settings group, a drizzle schema module, the Vite config passthrough, a template's resolved deps,
  island props, the block context's entry and site settings — are now named types (`LogMeta`,
  `SettingsBag`, `SchemaModule`, `ViteUserConfig`, `LoadedTemplateDeps`, `SerializedProps`,
  `HydratedEntry`, `SiteSettings`, and others), each declared once with a note saying what puts a
  non-serializable value in it. The types they alias are unchanged, so existing annotations keep
  compiling.

  This is the contract step of the JSON dictionary migration: a new `plumix/no-unsafe-dictionary` lint
  rule now rejects `Record<string, unknown>` written inline, so "JSON nobody has parsed" and "a bag
  that is open by design" can no longer share a spelling.

- [#1925](https://github.com/withplumix/plumix/pull/1925) [`9927a8f`](https://github.com/withplumix/plumix/commit/9927a8f7e1470a5f6bef1e5517545e3250d91feb) Thanks [@nasyrov](https://github.com/nasyrov)! - `openPlaygroundDb` now sets `busy_timeout = 5000` on the connection it
  returns. libsql opens with no busy handler, so a test-side write that
  overlapped one from the running worker — or from a sibling Playwright
  worker on the same file — failed on the first attempt instead of waiting.

- [#1931](https://github.com/withplumix/plumix/pull/1931) [`6cc8e74`](https://github.com/withplumix/plumix/commit/6cc8e742f4ac44bc06a44cdc440e2852f7124900) Thanks [@nasyrov](https://github.com/nasyrov)! - Wires `blocks.htmlAllowlist` through to the renderer. All four of its fields — `extraTags`,
  `extraAttributes`, `schemes`, `allowProtocolRelative` — now change what `core/html` and
  `core/rich-text` render, on the public page and in the editor canvas.

  The allowlist was typed, documented, and built at boot, but nothing mounted `HtmlAllowlistProvider`,
  so every render fell back to the context default — the baseline. Setting
  `htmlAllowlist: { extraTags: ["img"] }` produced silence, not an image.

  `HtmlAllowlistProvider` is the seam, mounted in both consumers. The public render mounts it from
  `renderEnv.htmlAllowlist`, alongside the existing `PlumixProvider`. The editor canvas is a fresh
  React tree inside an iframe with no server context, so the allowlist crosses the boundary the way
  tokens and breakpoints already did: on the JSON embed the SSR emits next to the mount root, read back
  at mount. Without that second mount the canvas would keep sanitizing against the baseline while the
  published page used the operator's list, and an author would see their markup stripped in the editor
  and intact on the site.

  That embed is now `[data-plumix-render-env]` rather than `[data-plumix-style-env]` — it carries more
  than styles. Nothing outside the editor runtime reads it, and the SSR and the runtime that reads it
  ship together.

  This lands alongside the three floor changesets in the same release: the denials in
  `enforceHtmlFloors` are what an override cannot widen past, and they went in before anything could
  reach the renderer through them.

  `PlumixApp.htmlAllowlist` documented the missing step as `<EntryContent htmlAllowlist={...}>`.
  `EntryContent` is an interface, not a component, so that seam never existed and could not be
  followed; the field now describes the provider.

- [#1928](https://github.com/withplumix/plumix/pull/1928) [`9cf71d9`](https://github.com/withplumix/plumix/commit/9cf71d92e67aa95635a06cfef8e019bb6fab603d) Thanks [@nasyrov](https://github.com/nasyrov)! - Worker-driven e2e suites can now start every attempt from the same
  database. Import `test` from `plumix/test/playwright` instead of
  `@playwright/test` and a worker-scoped fixture restores the playground D1
  to its post-`globalSetup` baseline once per attempt — the cadence a retry
  needs, since `.wrangler/state` is wiped once per suite run. Suites whose
  playground has a shared D1 are also pinned to a single worker, which that
  shared database always required.
- Updated dependencies [[`2f70692`](https://github.com/withplumix/plumix/commit/2f70692410fc65a66e843a4db33170c1ad954dc1), [`b2b6510`](https://github.com/withplumix/plumix/commit/b2b6510460703249f17dcd0ba676dab3b7ef2caa), [`1a475b5`](https://github.com/withplumix/plumix/commit/1a475b599314a315a850832fd59f0cedec22e675), [`1b97c01`](https://github.com/withplumix/plumix/commit/1b97c01a99828538110e1cefd60dbcff3828c92f), [`6cc8e74`](https://github.com/withplumix/plumix/commit/6cc8e742f4ac44bc06a44cdc440e2852f7124900), [`efe3834`](https://github.com/withplumix/plumix/commit/efe3834bebb073105d6912152091627cce700a63)]:
  - @plumix/blocks@0.16.0

## 0.15.0

### Minor Changes

- [#1825](https://github.com/withplumix/plumix/pull/1825) [`c0771f0`](https://github.com/withplumix/plumix/commit/c0771f010290452887f758483a25a2e303dbf346) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `createTestContext` and `applyTestSchema` to `plumix/test` — a real `AppContext` for tests that call a service function directly, and a one-liner for creating a drizzle schema module's tables on an existing test db.

- [#1894](https://github.com/withplumix/plumix/pull/1894) [`b39380a`](https://github.com/withplumix/plumix/commit/b39380a7dab2780ec1f36729328258b529b85800) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the returns that were left `unknown`. A function declaring a return type of `unknown` — or a
  promise of one — is now rejected in production source by `plumix/no-unknown-return`, and the
  signatures it found say what they hand back.

  **Source-breaking for plugin authors** on the type level. Three sites also emit different JS, each
  noted below.

  - The `.sanitize()` callback on the `json()` and `entry()`/`term()`/`user()` reference builders, on
    `media()`, and on a hand-written `MetaBoxField` object returns `JsonValue`. The value is written
    to a JSON column, so this is what the write path already required — a callback returning a `Date`
    reached the driver as whatever `JSON.stringify` made of it. The typed builders (string, color,
    link, number, range, select, temporal, toggle) still take
    `(value: NonNullable<V>) => NonNullable<V>` and are unaffected for callers.
  - `LinkValue` is a `type` alias rather than an `interface`, so a link value assigns to `JsonObject`
    (TypeScript withholds the implicit index signature from an interface).
  - A telemetry record's `data` is `JsonValue`, and `TelemetryCollector.record` takes
    `JsonValue | (() => JsonValue)` — matching `TelemetrySpanHandle.set`, which already did. The
    debug bar still sanitizes at read time, since nothing checks the type at runtime.
  - The read-error mappers (`toRpcEntryReadError`, `toRpcTermReadError`) return `Error | undefined`
    instead of passing a foreign error through: `undefined` means "not mine to translate", and the
    caller rethrows what it caught. This removes a latent `throw undefined` on an unrecognized error
    code.

  One further behaviour change, in a forgiving-read fallback: a meta value stored as an object or
  array under a field since narrowed to `string` now reads back as its JSON rather than as
  `"[object Object]"` or `"a,b"`.

- [#1826](https://github.com/withplumix/plumix/pull/1826) [`064ff07`](https://github.com/withplumix/plumix/commit/064ff07cbf36728beb2afcfcddfe82f0fd36f193) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `JsonObject` and gives `JsonValue` a home of its own, both exported from `plumix`. Use them to describe data that crosses a serialization boundary — stored metadata, span attributes, message payloads — instead of a dictionary of `unknown`. `JsonValue` was previously reachable only as a wildcard re-export of an internal telemetry module; it is now a deliberate part of the public API.

- [#1880](https://github.com/withplumix/plumix/pull/1880) [`e5d9d6b`](https://github.com/withplumix/plumix/commit/e5d9d6bef5b901206a3fd4f9a68d84b9edadb4ef) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `PlumixApp.loadMcpHandler`, mirroring `loadRestHandler`: the MCP entry point now loads through
  a memoized loader on the app rather than a module-scoped one shared across everything in the
  isolate. The handler's shape is exported as `McpHandler`. `createDispatcherHarness` gains a
  `coldInterfaces` option for substituting either cold-interface loader, so a test can assert that a
  disabled interface is never reached for.

- [#1882](https://github.com/withplumix/plumix/pull/1882) [`b6dcb7f`](https://github.com/withplumix/plumix/commit/b6dcb7f0a507dd1989e0ca3b86b0fb16927487f0) Thanks [@nasyrov](https://github.com/nasyrov)! - Types the JSON columns and the meta write path with the public `JsonObject` / `JsonValue` types. `entries.meta`, `terms.meta`, `users.meta` and `auth_tokens.payload` now read as `JsonObject` instead of `Record<string, unknown>`, and a sanitized meta patch carries `JsonValue` values.

  **Source-breaking for plugin authors** on the type level only — the emitted JS is unchanged. A read procedure hands its row back with meta already resolved by the field adapters, so the output filters for `entry.list`/`get`/`create`/`update`/`duplicate`, `term.list`/`get`/`create`/`update` and `user.get`/`update` now take `WithResolvedMeta<Entry | Term | User>` rather than the bare row; a filter annotated with the row type no longer assigns. `MetaPatch.upserts` is a `Map<string, JsonValue>`, and writing a `meta` column from a `Record<string, unknown>` needs the value proved first. `ResolvedMeta` and `WithResolvedMeta` are exported from `plumix`.

  One behaviour change, in a path that could not previously succeed: a meta field whose `.sanitize()` callback returns `undefined` now leaves its key untouched instead of upserting `undefined`, which reached the driver as an unbindable `json_set` parameter.

- [#1904](https://github.com/withplumix/plumix/pull/1904) [`5a24bfc`](https://github.com/withplumix/plumix/commit/5a24bfcd445c2cf1b89224f5ec07f4fef1080c57) Thanks [@nasyrov](https://github.com/nasyrov)! - Retypes `PluginRpcRouter`, the shape `registerRpcRouter` accepts, from `Record<string, any>` to
  oRPC's own router type, so a plugin can name what its router-building function returns. Handing
  `registerRpcRouter` a plain callable, or anything else that is not a procedure, is now reported
  where the router is written instead of as a 404 at request time. Sub-routers still nest to any
  depth, and lazy ones are accepted, as oRPC allows.

  It was already reachable through `plumix/plugin` — it just published a dictionary of `any`, so
  naming it bought nothing over the loose annotation both first-party routers were using instead.

  Source-breaking for plugin authors on the type level only; the emitted JS is unchanged. Migration:
  a router-building function annotated `Record<string, unknown>` (or `Record<string, any>`) should now
  return `PluginRpcRouter`. If you name the router's shape separately, declare it with `type` and not
  `interface` — TypeScript withholds the implicit index signature from interface declarations, so an
  interface never assigns.

### Patch Changes

- [#1889](https://github.com/withplumix/plumix/pull/1889) [`82fa032`](https://github.com/withplumix/plumix/commit/82fa0323aada1c0c37e17261a4d2c62f7b585584) Thanks [@nasyrov](https://github.com/nasyrov)! - Registers `core/html` with the rest of `coreBlocks`, so the raw-HTML block appears in the inserter
  and renders without a site installing it by hand.

  It was held out of `coreBlocks` when it had no sanitizer, on the understanding that a site wanting
  the escape hatch would register it explicitly. That route stopped working: block registration rejects
  any name in the reserved `core/` namespace, so neither a theme's `blocks` field nor a plugin's
  `registerBlock` would take it, and the block shipped unreachable. The reason for holding it back is
  also gone — it renders through `sanitizeHtml`, the same path `core/rich-text` already takes, so it
  adds no rendering surface a site did not already have.

  What survives sanitizing is the baseline allowlist: text-level markup and `http`/`https`/`mailto`/
  `tel` anchors. `script`, `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`, `form`,
  `input`, `textarea`, `button`, `svg` and `math` are denied outright and stay denied whatever a site
  configures. Others, `img` among them, are simply absent from the baseline and can be added.

  Two caveats worth knowing. There is no per-block disable, so a site that would rather not offer a
  raw-HTML block has no switch for it. And `blocks.htmlAllowlist` does not currently reach the
  renderer at all — everything sanitizes against the baseline until that is wired up.

- [#1806](https://github.com/withplumix/plumix/pull/1806) [`cfae716`](https://github.com/withplumix/plumix/commit/cfae716b9a39873db45ccb79083f4e1753e14744) Thanks [@nasyrov](https://github.com/nasyrov)! - Stops `mockManifest` forwarding stale response headers onto the document it rewrites. `content-encoding`, `content-length`, `transfer-encoding`, `etag`, and `last-modified` all described the original bytes, not the decoded and resized body being served, so they are now dropped and Playwright reframes the response itself.

- [#1803](https://github.com/withplumix/plumix/pull/1803) [`b014e4d`](https://github.com/withplumix/plumix/commit/b014e4d212f1ccde8af3dd1464a1fea4143b97f9) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes the `mockManifest` Playwright helper throwing "Response has been disposed" and failing an unrelated test. Document responses disposed mid-rewrite are now served unmodified instead of erroring.
- Updated dependencies [[`5fbb8cf`](https://github.com/withplumix/plumix/commit/5fbb8cf6faa061554f32c4f3ca490be03449a3d4), [`b39380a`](https://github.com/withplumix/plumix/commit/b39380a7dab2780ec1f36729328258b529b85800), [`82fa032`](https://github.com/withplumix/plumix/commit/82fa0323aada1c0c37e17261a4d2c62f7b585584), [`482b4e6`](https://github.com/withplumix/plumix/commit/482b4e697cbf6b2f014e712315050f474f502fe0), [`fdd72b8`](https://github.com/withplumix/plumix/commit/fdd72b89167237d25bc3ced465e0d2543c37b40b)]:
  - @plumix/blocks@0.15.0

## 0.14.0

### Minor Changes

- [#1781](https://github.com/withplumix/plumix/pull/1781) [`7c7be38`](https://github.com/withplumix/plumix/commit/7c7be38e813530a3e27dd7d34df509470b5d1280) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a browser-safe `@plumix/core/admin` subpath exposing the admin
  runtime-alias constants (`SHARED_ADMIN_RUNTIME_SPECIFIERS`,
  `adminRuntimeShimSlug`, and the `SharedAdminRuntimeSpecifier` type).

  `plumix/admin` co-exports the browser-facing `getRuntime` accessor with these
  build-time constants. They were reached through the flat `@plumix/core` root
  barrel, which statically imports `node:async_hooks` (via the request-context
  stores) — so a plugin chunk importing `plumix/admin` for `getRuntime` would
  fail its esbuild-for-browser build on the unresolved `node:async_hooks`. The
  constants now come from the barrel-free `@plumix/core/admin` subpath instead.

  Migration: none. The root barrel still re-exports the same constants (so
  server-side consumers are unchanged); `@plumix/core/admin` is an additional,
  browser-safe way to reach them.

- [#1774](https://github.com/withplumix/plumix/pull/1774) [`56cdc6f`](https://github.com/withplumix/plumix/commit/56cdc6f616413c4d20be9a3cccff303259cae1ac) Thanks [@nasyrov](https://github.com/nasyrov)! - Remove the drizzle query operators and schema tables from the flat `@plumix/core`
  / `plumix` root barrel. They now live only on their dedicated seams:
  `plumix/db` (`@plumix/core/db`) for the query operators, table-introspection
  helpers, unique-constraint guards, and edge-cache purge vocabulary; and
  `plumix/schema` (`@plumix/core/schema`) for the schema tables and their inferred
  row types.

  Direct DB writes are a specialized concern the `plumix/db` seam is designed to
  own (its purge vocabulary exists precisely because direct writes bypass core's
  auto-purge). Re-exporting the same operators and tables from the root barrel
  widened the root interface with that concern and gave newcomers two ways to
  import the same thing with no signal about which is canonical. `plumix/db` and
  `plumix/schema` are now the single canonical seams.

  The `traceDbQuery` / `traceDbBatch` span helpers stay on the root barrel — they
  wrap `ctx.db` in runtime adapters and aren't part of the direct-write toolkit.

  Migration: if you imported drizzle operators (`eq`, `and`, `sql`, `inArray`,
  `getTableColumns`, the `SQL` type, …) from `plumix` / `@plumix/core`, import them
  from `plumix/db` (`@plumix/core/db`) instead. If you imported schema tables
  (`entries`, `terms`, `settings`, `users`, …) or their row types (`Entry`,
  `User`, `UserRole`, `Term`, …) from the root, import them from `plumix/schema`
  (`@plumix/core/schema`). The `plumix/plugin` bundle no longer re-exports these
  either, so plugins that reached for db symbols through it move to the same two
  seams.

- [#1782](https://github.com/withplumix/plumix/pull/1782) [`4155a46`](https://github.com/withplumix/plumix/commit/4155a467dcd5e358d3c335849943e7683fc804cd) Thanks [@nasyrov](https://github.com/nasyrov)! - Turn the `kv` slot into a working key/value store.

  The `kv` config slot was previously a marker interface with no methods —
  accepted in config but never usable at runtime. It now carries a real
  `ConnectedKv` contract (`get` / `put` with `expirationTtl` / `delete` / `list`
  with prefix + cursor pagination), exposed on the request context as `ctx.kv`
  and traced like the `storage` and `cache` slots.

  `@plumix/core` ships `memoryKv()`, a backend-agnostic in-memory adapter for dev
  and tests (string values, a 1..1000 list page cap; no backend-specific TTL
  floor). `@plumix/runtime-cloudflare`'s `kv({ binding })` binds a Workers KV
  namespace and implements the same contract. The port is deliberately
  runtime-neutral — a Node runtime over Redis would implement the same `KV`
  interface.

  Usage:

  ```ts
  import { kv } from "@plumix/runtime-cloudflare";

  plumix({
    kv: kv({ binding: "SESSIONS" }),
    // ...
  });

  // in a plugin handler:
  await ctx.kv?.put("key", "value", { expirationTtl: 3600 });
  const value = await ctx.kv?.get("key");
  ```

  `create-plumix-app` gains a `kv` scaffold capability for the Cloudflare runtime:
  a plugin that requires `kv` now automatically wires `kv({ binding: "KV" })` and a
  `KV` namespace binding into the generated `wrangler.jsonc`.

- [#1770](https://github.com/withplumix/plumix/pull/1770) [`f579afb`](https://github.com/withplumix/plumix/commit/f579afbbf0e297b1c591d23a2c3b20c178880bc6) Thanks [@nasyrov](https://github.com/nasyrov)! - Remove the redundant `lookup.resolve` RPC and `LookupAdapter.resolve`.

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

- [#1779](https://github.com/withplumix/plumix/pull/1779) [`320f222`](https://github.com/withplumix/plumix/commit/320f222c5b365079a8f618b1955dbb2e59bd37d8) Thanks [@nasyrov](https://github.com/nasyrov)! - Rename the read-time `hydrate*` reference/meta family to `resolve*`, freeing the
  word "hydration" for its one canonical sense: island hydration (attaching client
  React to server markup).

  "Hydration" meant two unrelated things in the code. Island hydration is the
  load-bearing sense. The read-time data-enrichment family — resolving referenced
  entities and meta bags into rows during a read — is resolution, not hydration.
  Reserving "hydration" for islands and renaming the enrichment family removes the
  collision (`CONTEXT.md` glossary updated to match).

  Renamed: `hydrateReferences` → `resolveReferences` (the public, theme-facing
  id-set resolver), plus the core-internal `hydrateMetaBags`/`hydrateMetaReferences`
  pipeline and the per-entity `hydrateEntryMeta`/`hydrateEntriesMeta`/
  `hydrateTermMeta`/`hydrateUserMeta` read helpers. The `LookupAdapter.hydrate`
  contract method and the reference-shape types are unchanged — the adapter still
  `hydrate`s a payload; the pipeline that calls it now `resolve`s references.

  Migration: if you imported `hydrateReferences` from `plumix` / `@plumix/core` to
  resolve an id-only reference field in a theme, import `resolveReferences` instead
  — same signature and behavior. Custom `LookupAdapter` implementations need no
  change.

### Patch Changes

- Updated dependencies []:
  - @plumix/blocks@0.14.0

## 0.13.0

### Minor Changes

- [#1749](https://github.com/withplumix/plumix/pull/1749) [`f3971a8`](https://github.com/withplumix/plumix/commit/f3971a8ec726a12ab7aa2e0c2897d48f3d5c4889) Thanks [@nasyrov](https://github.com/nasyrov)! - Add access policies and a hard gate for theme-facing routes.

  Declare who may see a route or entry type as a resolver over the current
  visitor that returns a discrete outcome — a segment plus a gate decision. The
  framework enforces it: an anonymous visitor to an authenticated-only page is
  redirected to sign in (and returned afterwards), and an under-privileged visitor
  to a role-gated page is denied.

  ```ts
  import { challenge, definePolicy, grant, redirectToLogin } from "plumix";

  const membersOnly = definePolicy({
    segments: ["members"],
    resolve: (ctx) =>
      !ctx.user
        ? redirectToLogin()
        : !hasActiveSub(ctx.user)
          ? challenge("subscribe")
          : grant("members"),
  });
  ```

  Attach a policy at the entry-type level (`access.default`, gating a type's
  single and archive routes) or on a custom archive; the built-in
  `anonymousPolicy` / `authenticatedPolicy` / `rolePolicy` cover the common cases.
  The decision logic is unconstrained (role, a `meta` flag, an external check),
  but the return shape is closed, so the gate stays sound. `auth({ loginPath })`
  points sign-in at a theme-owned page.

  Un-policied routes are unchanged. A policied page renders live in this release;
  keying the edge cache on the segment is a follow-up.

- [#1756](https://github.com/withplumix/plumix/pull/1756) [`6d6db5c`](https://github.com/withplumix/plumix/commit/6d6db5c6a2defabfc0737f570f4d30a40c7ee67d) Thanks [@nasyrov](https://github.com/nasyrov)! - Derive the built-in field-type vocabulary from one runtime roster.

  The set of built-in meta-box `inputType` names now has a single source — a
  per-family roster (`STRING_INPUT_TYPES`, `TEMPORAL_INPUT_TYPES`,
  `SCALAR_INPUT_TYPES`, `REFERENCE_INPUT_TYPES`, `CHOICE_INPUT_TYPES`,
  `STRUCTURAL_INPUT_TYPES`, `LEGACY_INPUT_TYPES`, and the derived
  `CANONICAL_INPUT_TYPES`) exported from `@plumix/core/fields`. The string and
  temporal input-type unions derive from these arrays, and a compile-time
  exhaustiveness guard — enabled by splitting `MetaBoxField` into the newly
  exported `CanonicalMetaBoxField` and the legacy catch-all — binds the roster
  to the union, so the two can no longer drift. The admin's reserved-name set
  and its unknown-type warning now derive from the roster instead of hand-synced
  copies.

  The only consumer-visible behaviour change: the built-in `group` and `link`
  field types are now **reserved**, so a plugin can no longer register a custom
  field type under those names and shadow the host control (they previously
  slipped through the hand-maintained set). `media` / `mediaList` remain
  unreserved — they are plugin-contributed reference kinds whose own admin
  renderers register through the same seam.

- [#1744](https://github.com/withplumix/plumix/pull/1744) [`4f5730d`](https://github.com/withplumix/plumix/commit/4f5730dcaecb587396c41f7c10229f3689de52c8) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an opt-in `auth({ selfSignup: { defaultRole } })` switch that opens public
  registration.

  Self-service signup was gated to the `allowed_domains` allowlist, so "anyone can
  register as a subscriber" meant re-implementing the flow from primitives. With
  `selfSignup` set, a first-time verified email through the built-in magic-link or
  OAuth flows provisions a new user at `defaultRole` regardless of
  `allowed_domains`:

  ```ts
  auth({ passkey, magicLink, selfSignup: { defaultRole: "subscriber" } });
  ```

  Omit it (the default) and signup stays domain-gated exactly as before. The
  bootstrap rail is unchanged — the first admin still enrols via passkey (or
  `bootstrapVia: "first-method-wins"`), and self-signup never mints the first user
  on an empty deploy.

  Because enabling this turns the magic-link request endpoint into a public signup
  surface, issuance is now rate-limited: at most five magic-link tokens per email
  within a 15-minute window. Over the cap the request is a silent no-op, so the
  endpoint stays timing- and shape-uniform for registered vs unregistered emails
  and can't be turned into an email-bomb amplifier or an enumeration probe.

- [#1755](https://github.com/withplumix/plumix/pull/1755) [`dcda2fa`](https://github.com/withplumix/plumix/commit/dcda2fa124117175f5a56f587c22e95d6f14d89e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let editors set per-entry visibility, choosing from the policies a type declares.

  An entry type can offer a closed set of selectable access policies beside its
  default, and an editor assigns one to an individual entry from the document
  settings — no code change per entry. Precedence is per-entry › entry-type ›
  global, so a single article can be members-only even when its type is public.

  ```ts
  ctx.registerEntryType("article", {
    access: {
      default: anonymousPolicy, // public by default…
      policies: [
        // …but an editor may lock an individual entry to members.
        { key: "members", label: "Members only", policy: authenticatedPolicy },
      ],
    },
  });
  ```

  The choice persists on the entry and drives both the hard gate and the segment
  the edge cache keys on. An editor can only pick a policy the developer declared
  (`entry.update` validates the key server-side), and a type that declares no
  selectable policies pays no extra lookup — the hot path is unchanged. A
  would-be-404 falls back to the type default, so gating never leaks which slugs
  exist, and a stale selection (a policy the developer removed) falls back to the
  default rather than granting less.

  This completes the theme-facing access-control model: policies now attach at the
  global, entry-type, and per-entry levels.

- [#1750](https://github.com/withplumix/plumix/pull/1750) [`202a1fc`](https://github.com/withplumix/plumix/commit/202a1fc788e5386c08ba6c9d69bbba49c3503fc6) Thanks [@nasyrov](https://github.com/nasyrov)! - Key the edge cache on the access-policy segment, so signed-in visitors share
  cached renders instead of each bypassing the cache.

  A policied route resolves to a discrete segment (`anonymous`, `authenticated`,
  `role:<role>`, or a developer's `entitlement:<label>`); that segment now
  participates in the cache key. Two visitors in the same non-private segment whose
  render is byte-identical share one edge entry — the "subscribers-only" page is
  cached once per segment at its real URL instead of rendering live for every
  logged-in request. The cache-tag vocabulary (`t:` / `e:`) is unchanged, so one
  publish of an entry still purges every segment variant at once.

  ```ts
  // Shared-cacheable for all logged-in visitors — the explicit opt-in.
  ctx.registerEntryType("article", {
    access: { default: authenticatedPolicy },
  });

  // Gated but never shared-cached — the escape hatch for a personalized page.
  definePolicy({
    resolve: (c) => (c.user ? grant("private") : redirectToLogin()),
  });
  ```

  A new built-in `private` segment is the escape hatch: its render is per-visitor
  and never read from or written to the shared cache. Un-policied pages are
  unchanged — an anonymous request caches under the plain URL exactly as before,
  and a request carrying a session (or an `Authorization`/`?preview=` grant) stays
  private. Nothing is inferred; cache behavior follows only the declared policy.

### Patch Changes

- Updated dependencies [[`c01d2a3`](https://github.com/withplumix/plumix/commit/c01d2a3f843cdf743ba2f4cc5812c245cb9d918d)]:
  - @plumix/blocks@0.13.0

## 0.12.0

### Minor Changes

- [#1729](https://github.com/withplumix/plumix/pull/1729) [`665a57b`](https://github.com/withplumix/plumix/commit/665a57b421fc2f82dcf0dad7d0a89e2497557959) Thanks [@nasyrov](https://github.com/nasyrov)! - Let custom archives opt into the edge cache and contribute cache tags.

  `registerArchiveType` now accepts a `cacheable` flag, and a custom-archive resolver's
  `CustomArchiveResolution` may return `tags`. When `cacheable` is set, a `custom`
  route's anonymous GET renders participate in the built-in edge cache instead of
  rendering live on every request, and the resolver's `tags` are stored on the response
  so a publish of the listed types purges the archive — the same coarse, publish-driven
  invalidation the built-in entry, taxonomy, and front-page archives already get.
  Previously `custom` intents bypassed the Workers Cache API entirely and carried no
  tags, so faceted or rollup archives that the built-in taxonomy archive can't express
  lost edge caching and tag-based purge.

  The two knobs are split deliberately: the cache gate runs before render, so the opt-in
  (`cacheable`) must be static, while `tags` are consumed only at store time and ride on
  the resolution. Both default off and no-op safely on their own — `tags` without
  `cacheable` never caches; `cacheable` without `tags` caches under `s-maxage` alone.
  Tags flow through the existing embedded-reference tag accumulator, and the pure cache
  decision layer stays free of the archive-type registry lookup.

- [#1712](https://github.com/withplumix/plumix/pull/1712) [`c74ca2f`](https://github.com/withplumix/plumix/commit/c74ca2ffc069209d543e5d606a2ded8b22245a1e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let custom archives contribute a sitemap scope, and give `seo:sitemap:urls` the request context.

  `registerArchiveType` now accepts a `sitemap` provider (`{ count, urls }`), mirroring
  its existing `feed` option. Core folds the archive's URL space into the native
  sitemap index under a paginated `/sitemap-<name>-<page>.xml` scope: `count(ctx)`
  drives index pagination (kept cheap — no URL scan), and `urls(ctx, page)` produces
  each 1000-URL page. Previously a custom archive was neither an entry type nor a
  taxonomy, so its URLs were absent from sitemaps entirely.

  The `seo:sitemap:urls` filter now also receives the 1-based `page` and the request
  `ctx` — `(urls, scope, page, ctx)`. A subscriber can now query the DB to inject
  rows and paginate its adjustments, not just reshape statically-known URLs. The new
  arguments are appended, so existing `(urls, scope)` subscribers are unaffected.

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

- [#1732](https://github.com/withplumix/plumix/pull/1732) [`05ea95c`](https://github.com/withplumix/plumix/commit/05ea95c65a798ea2b74b7b3f3f533471aa4a483e) Thanks [@nasyrov](https://github.com/nasyrov)! - Accept a set of passkey origins so custom domains and preview deploys can enrol.

  `auth.passkey` gains an optional `allowedOrigins` — extra origins the WebAuthn
  ceremony accepts alongside `origin`, each an exact origin
  (`https://www.example.com`) or a subdomain wildcard
  (`https://*.acme.workers.dev`). Every entry's host must be `rpId` or a subdomain
  of it (the registrable-suffix rule), validated at config time. `rpId` is still
  the sole anchor and is never derived from the request, so a policy can only
  _accept_ origins the operator declared — never widen the set from a
  request Host. Verification stays pinned to `origin` when `allowedOrigins` is
  unset, so existing single-host deploys are unchanged.

  `auth.passkey.origin` and `.allowedOrigins` also accept an `(env) => …`
  resolver (the same `EnvInput` form as secret slots), so the public origin can be
  sourced from a runtime env var (`PUBLIC_ORIGIN`) per deploy instead of hardcoded
  — resolved per request, consistent across runtimes rather than reconstructed
  from Cloudflare's build-time env. Literal values keep their config-time
  validation; resolver forms defer to runtime. The canonical `app.origin` (CSRF,
  magic-link, OAuth, sitemap, cron) resolves through the same value.

  `cloudflareDeployOrigin()` now anchors `rpId` to the account registrable domain
  (`<account>.workers.dev`) and returns `allowedOrigins:
["https://*.<account>.workers.dev"]`, so one passkey enrolled once is valid on
  production **and** every per-branch preview URL. It also accepts
  `productionOrigin` for deploys served on a custom domain, which Workers Builds
  cannot expose to the build.

  **Breaking (`@plumix/runtime-cloudflare`):** `cloudflareDeployOrigin()` no longer
  returns the full worker host as `rpId` — production now yields
  `rpId: "<account>.workers.dev"` instead of `rpId: "<worker>.<account>.workers.dev"`.
  Passkeys enrolled against the old per-worker `rpId` must be re-enrolled once
  after upgrading. A custom domain and `workers.dev` remain different registrable
  domains, so no single passkey spans both — authenticate custom-domain-production
  previews with an origin-agnostic method (magic-link / Cloudflare Access).

- [#1709](https://github.com/withplumix/plumix/pull/1709) [`66bce99`](https://github.com/withplumix/plumix/commit/66bce99343595168a13272b947cebb074aa30650) Thanks [@nasyrov](https://github.com/nasyrov)! - Add per-entity OpenGraph `og:image` from a featured media field.

  Theme and plugin authors can mark a media field `media("hero").featured()` (the
  entry's representative image) or `media("share").ogImage()` (an explicit
  social-share override). Public entry pages now emit a per-entity `og:image` —
  resolved as the `ogImage`-role field → the `featured`-role field → the existing
  site-wide `default_og_image` — and upgrade the Twitter card to
  `summary_large_image`, instead of only the single site default. The field name is
  free; the role is what core keys on, and it reads the hydrated media reference
  structurally so core takes no dependency on `@plumix/plugin-media`.

  `buildManifest` rejects an entry type with more than one `featured` field, and any
  role-tagged field that stores multiple values, so a per-entity `og:image` always
  resolves to one deterministic image. The Cloudflare edge SVG→PNG rasterization
  path and storage-backed serve route are tracked separately ([#1708](https://github.com/withplumix/plumix/issues/1708)).

- [#1728](https://github.com/withplumix/plumix/pull/1728) [`5785f19`](https://github.com/withplumix/plumix/commit/5785f19862495b1c445640fbc58a3210d6b0c2ff) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a plugin/site/theme surface for public-route redirects (301/302/307/308) and `410 Gone`.

  Previously the only redirect the public pipeline emitted was the dispatcher's own
  canonical normalization, so a plugin could map a URL to content but never to a
  redirect or a 410. Migrating an existing site (legacy `path → path` moves, or
  turning a removed entry's URL into a redirect-to-successor / 410 instead of a soft 404) had to be punted to the CDN zone.

  Redirects are now a first-class part of the app, contributed through whichever
  surface owns the URL, all merged into one precedence-ordered set matched by the
  dispatcher **ahead of the content route map** (so a redirect shadows a would-be
  page):

  - **Site** — `config.redirects` on the plumix config, for the site's own cutover
    list.
  - **Plugin** — `ctx.registerRedirects([...])` in a plugin's setup, for
    feature-owned or data-driven redirects.
  - **Theme** — a declarative `redirects: [...]` field on the theme descriptor
    (themes have no setup hook), for URL-structure moves the theme owns.

  Each rule maps a `from` to a target, where `from` is a `URLPattern` string
  (`/team/:slug`, `/legacy/*`; use a `RegExp` for literal paths with URLPattern
  metacharacters), or a `RegExp` (with `$1` / `$<name>` backreferences interpolated
  into `to`); `{ gone: true }` yields a 410. A rule may instead supply `match(url)`
  for a fully dynamic decision (e.g. a DB lookup). The request query string is
  carried onto the target by default (a `preserveQuery: false` per-rule flag opts
  out; a target that states its own `?…` is never appended to). Precedence is
  site → plugin → theme by default, and a per-rule `priority` overrides it (lower
  wins).

  The redirect stage runs after the reserved SEO asset routes (robots.txt,
  sitemaps, feeds) but ahead of the static-asset 404 shortcut and the content route
  map — so a moved image/css/js can redirect, and a redirect shadows a would-be
  content page. Only `GET`/`HEAD` public requests reach it.

  New public types: `RedirectRule`, `RedirectResolution`, `RedirectTarget`,
  `RedirectStatus`.

### Patch Changes

- [#1731](https://github.com/withplumix/plumix/pull/1731) [`c5facfe`](https://github.com/withplumix/plumix/commit/c5facfee050d3f5880de31dc6866dd48c4ac3d41) Thanks [@nasyrov](https://github.com/nasyrov)! - Standardize type augmentation on the single public `plumix` specifier.

  The augmentable registry docstrings (`EntryTypeRegistry`, `ArchiveTypeRegistry`,
  `TermTaxonomyRegistry`, `TemplateDepRegistry`, `ReferenceHydrationShapes`,
  `BlockTypeRegistry`, `PatternCategoryRegistry`) told consumers to
  `declare module "@plumix/core"`. That specifier is an internal package consumers
  don't depend on, so the augmentation silently no-op'd and `forEntryType("…")`
  still errored — the bug reported in [#1691](https://github.com/withplumix/plumix/issues/1691).

  Every registry is now augmented through one specifier, `declare module "plumix"`:

  ```ts
  declare module "plumix" {
    interface EntryTypeRegistry {
      insight: { entry: ResolvedEntry };
    }
  }
  ```

  `plumix` re-exports the block/pattern registries (`BlockTypeRegistry`,
  `PatternCategoryRegistry`, type-only) so the whole augment surface lives behind
  one module. Using one specifier matters: augmenting the same interface through
  two of them (e.g. `plumix` and `plumix/plugin`) fractures declaration merging —
  each view drops the other's keys. A `no-restricted-syntax` lint rule now forbids
  augmenting `@plumix/*` packages or `plumix/*` subpaths, steering everything to
  `plumix`. See `docs/type-augmentation.md`.

- [#1727](https://github.com/withplumix/plumix/pull/1727) [`30f287e`](https://github.com/withplumix/plumix/commit/30f287e72470efd50ce4e95183c4f7e89f8e0843) Thanks [@nasyrov](https://github.com/nasyrov)! - Stop the dev error page from scrolling sideways on wide SQL or header values.

  The context, plugin-panel, and executed-query lists on the `plumix dev` error
  page rendered as bare `display: grid`, so their implicit column sized to
  `max-content` — a long single-line `select … where (…)` query or a long
  `accept` / `user-agent` header grew it past the viewport, scrolling the whole
  page body sideways and clipping the content past each panel's right edge. Each
  grid now pins its column to `minmax(0, 1fr)` (matching the stack/source and
  hydration-diff grids), so wide content stays inside its own `overflow-x` / word
  wrap block: SQL rows scroll within their block and header values wrap.

- [#1705](https://github.com/withplumix/plumix/pull/1705) [`88b6db2`](https://github.com/withplumix/plumix/commit/88b6db2b94c94a0a9c12f4d8cb84289f28cd7558) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix a flash of unstyled content (FOUC) on first paint in `plumix dev`.

  Theme stylesheets declared via `defineTheme({ css: ["./theme/app.css"] })` were
  delivered in dev only through the client-entry `<script>`, which side-effect-
  imports the CSS so Vite injects `<style>` tags after hydration — the page painted
  unstyled for a moment, then snapped in. The dev SSR response now also links each
  resolvable theme CSS path with a render-blocking `<link rel="stylesheet">` in
  `<head>`, so the first frame is styled, matching the production build.

  The client-entry `<script>` still loads, so CSS hot-module replacement is
  unchanged. Aliased (`~`, `@/`) and npm-scope (`@scope/pkg`) CSS specifiers keep
  riding in on that import, since a browser `<link>` cannot resolve them.

- Updated dependencies [[`b124789`](https://github.com/withplumix/plumix/commit/b1247897f2044ad4e7f975ce2d0b8294fd0939af), [`56e416a`](https://github.com/withplumix/plumix/commit/56e416af8e753cc07cd0f87a26af4ef0c6fc343c), [`fff6e4a`](https://github.com/withplumix/plumix/commit/fff6e4a134e03a6fa1276c8d0d3d23c8cd7e134a)]:
  - @plumix/blocks@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`77ef988`](https://github.com/withplumix/plumix/commit/77ef988411eed32144bd4d5fabcc497fbbbac9ef), [`168466a`](https://github.com/withplumix/plumix/commit/168466a3e473a81ce77c0acff6678bbeac1dea9b)]:
  - @plumix/blocks@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [[`5743bfc`](https://github.com/withplumix/plumix/commit/5743bfc95516d55c67d633f4b61a4c9a1e092f8d)]:
  - @plumix/blocks@0.10.0

## 0.9.0

### Minor Changes

- [#1645](https://github.com/withplumix/plumix/pull/1645) [`24d9639`](https://github.com/withplumix/plumix/commit/24d96390631893c788b54fe6261c781ad798969c) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only request history to the debug bar so a developer can inspect
  requests that already finished — including RPC/REST/`/api` and 5xx responses
  that never get an inline bar.

  Every request the worker handles is captured, after the response, into a
  bounded in-memory ring as a serializable `DebugSnapshot` (span tree, telemetry
  records, and a small fixed projection of request context). Snapshots are
  detached to inert JSON at capture, so holding recent requests never pins the
  request graph, and oversized payloads are truncated to keep the footprint flat.

  The bar's panels now render purely from a `DebugSnapshot`, so a stored request
  replays identically to a live one and plugin panels support history for free.
  Dev-only read routes expose the history over HTTP — `GET
/_plumix/debug/requests` (newest-first metadata), `/<id>` (the snapshot JSON, a
  future MCP tool's canonical source), and `/<id>?format=html` (the same snapshot
  rendered to panel markup) — with the endpoint excluded from its own capture.

  The bar gains a request switcher: a `<select>` of the recent requests
  (method/path/status/duration, newest-first) with the current request
  pre-selected. The current request is still server-rendered inline on page load
  (no flash, zero-JS); selecting a past one is the bar's single client-JS
  concession — a minimal listen → fetch → swap that fails soft, so a history
  hiccup never breaks the host page. The whole subsystem — capture, store, routes,
  switcher, and script — is gated on the dev flag and tree-shaken from production
  builds.

- [#1649](https://github.com/withplumix/plumix/pull/1649) [`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e) Thanks [@nasyrov](https://github.com/nasyrov)! - Let plugins contribute panels to the `plumix dev` error page.

  The dev error page already shows fixed request / route / database / timeline /
  application context below the stack. A plugin can now add its own section
  through a new dev-only `error_page:panels` filter, mirroring how it contributes
  to the debug bar via `debug_bar:panels`:

  ```ts
  "error_page:panels": (
    panels: readonly DevErrorPanel[],
    error: unknown,
    ctx: AppContext,
  ) => readonly DevErrorPanel[];
  ```

  Each `DevErrorPanel` is `{ id, title, order?, render }`, where `render(error,
ctx)` returns a `ReactNode` over the caught value and the live request context —
  the same pair the `error_page:hints` filter receives. Core collects the filter
  `applyFilterIsolated`-safe, dedupes by id (last wins), orders by ascending
  `order`, and renders each panel in its own isolated SSR pass, so a throwing
  subscriber or a panel that throws from `render` degrades to a notice rather than
  crashing the very page meant to surface the error. Contributed panels appear as
  their own sections below the built-in context.

  Core registers none of its own — its built-in sections cover the common case —
  so this filter is purely the plugin-facing panel API. The whole surface stays
  behind the `PLUMIX_DEV` gate and tree-shakes out of production builds.

- [#1651](https://github.com/withplumix/plumix/pull/1651) [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an open-in-editor path remap for container and remote dev servers.

  The dev error page's "Open in editor" links use the file path as the dev server
  sees it, which doesn't exist on your machine when the server runs in a container,
  a devcontainer, or on a remote/SSH box. Set `PLUMIX_EDITOR_PATH_MAP` to a
  `from=>to` mapping (e.g. `/workspace=>/Users/me/proj`) and the on-server path
  prefix is rewritten to the editor-host path before each link is built, so the
  links open the right file. Only the path prefix is remapped, on a path boundary;
  paths outside it are left untouched. Like `PLUMIX_EDITOR`, it is read only in
  `plumix dev` and tree-shakes out of production builds.

- [#1650](https://github.com/withplumix/plumix/pull/1650) [`c16b2bc`](https://github.com/withplumix/plumix/commit/c16b2bcc112c82459a090a5e59fe263ee55ff658) Thanks [@nasyrov](https://github.com/nasyrov)! - Attach a correlation id to production 5xx responses so an operator can tie a
  user's report to a specific failure without exposing a stack.

  When a request throws at the dispatcher's public-render boundary in production,
  the themed `500` now carries the failing request's telemetry id as an
  `errorId`. It flows to the theme's error template via `ErrorData.errorId` and is
  printed on the built-in `500` page (`Reference ID: …`) when the theme ships no
  `500` template of its own. The id is the same value the telemetry envelope and
  structured `dispatch_failed` log already record, so quoting it maps straight to
  the request's snapshot and span — no new id is minted.

  Nothing about the production error path's isolation changes: `ErrorData` still
  exposes no `Error` field, and no stack, source, or exception message crosses the
  boundary. A `404` leaves `errorId` undefined; the dev error surface is
  unaffected.

### Patch Changes

- Updated dependencies [[`09e89b8`](https://github.com/withplumix/plumix/commit/09e89b88a7e8cbabe96baf7413c3c38149db905e), [`36ce243`](https://github.com/withplumix/plumix/commit/36ce24381eee89688b18cd77255bb9fb29429407), [`2d6753a`](https://github.com/withplumix/plumix/commit/2d6753a26e55df944bc194564190990db1b775ec), [`a9f5648`](https://github.com/withplumix/plumix/commit/a9f56484cb25875cd895538018139a706dc2ba80)]:
  - @plumix/blocks@0.9.0

## 0.8.0

### Minor Changes

- [#1609](https://github.com/withplumix/plumix/pull/1609) [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d) Thanks [@nasyrov](https://github.com/nasyrov)! - Show actionable "how to fix" hints on the `plumix dev` error page.

  When a recognized error reaches the dev error page, it now surfaces a prominent
  "how to fix" card above the stack. Core matches its own typed errors (e.g.
  `ThemeRegistrationError`) and a curated set of common untyped pitfalls — a D1
  `no such table` points at `plumix migrate`, a missing secret points at
  `.dev.vars`, a missing binding points at `wrangler.jsonc`. Unrecognized errors
  render no card.

  Hints are contributed through a new dev-only `error_page:hints` filter that
  mirrors `debug_bar:panels`: it runs on every dev 5xx with the caught error and
  request context, and plugins subscribe to add or override hints. The shared
  renderer at `@plumix/blocks/dev-error` gains the `DevErrorHint` shape and renders
  the cards. Everything stays gated on `process.env.PLUMIX_DEV` and tree-shakes out
  of production.

- [#1613](https://github.com/withplumix/plumix/pull/1613) [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35) Thanks [@nasyrov](https://github.com/nasyrov)! - Make a throwing block loader dev-fatal in `plumix dev`, naming the block.

  When a block's SSR loader rejects during development, the page now fails to the
  dev error page — naming the culprit block and surfacing the loader's own
  message and the failing query — instead of silently dropping that block from
  the render. In production the same rejection stays isolated to the block
  (degrading to its `errorFallback`, or nothing) and the page still renders, so
  the resilience contract is unchanged.

  The render path captures the first loader rejection and, behind the
  `process.env.PLUMIX_DEV` gate, throws a new `BlockLoaderError` (exported from
  `@plumix/blocks`) that propagates to the dispatcher catch. The wrapper names the
  block and loader key, carries the underlying message so error-page hints keep
  matching through the loader boundary, preserves the original via `cause`, and
  adopts its stack so frames resolve to the failure site. The gate tree-shakes the
  escalation out of production builds.

- [#1617](https://github.com/withplumix/plumix/pull/1617) [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443) Thanks [@nasyrov](https://github.com/nasyrov)! - Open a `plumix dev` error-page stack frame in your editor.

  Each frame on the dev error page now carries an "open in editor" link that jumps
  to the file at the offending line. It is a plain anchor to the editor's URL
  scheme — zero-JS, no server round-trip. The editor is chosen by a dev-only
  `PLUMIX_EDITOR` setting: a known-editor key (`vscode` — the default —
  `vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`, `phpstorm`, `webstorm`,
  `sublime`), a custom `{file}` / `{line}` / `{column}` format string for any other
  editor, or `off` / `none` to drop the link. Everything stays gated on
  `process.env.PLUMIX_DEV` and tree-shakes out of production.

- [#1606](https://github.com/withplumix/plumix/pull/1606) [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a dev-only error page for render throws in `plumix dev`.

  When a theme template throws during render in development, the visitor now gets
  a self-contained, theme-independent 500 page showing the exception name,
  message, and raw stack — instead of re-rendering the failure through the theme
  (which blanks the screen when the theme itself is the culprit). The page is a
  shared, zero-JS renderer exposed at `@plumix/blocks/dev-error` and SSR'd by core
  at the dispatcher catch. It is gated on `process.env.PLUMIX_DEV`, so the page
  and its styles tree-shake out of production builds — the existing themed 500 is
  unchanged.

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

- [#1557](https://github.com/withplumix/plumix/pull/1557) [`4481cf2`](https://github.com/withplumix/plumix/commit/4481cf28a6b9feef66ddc4f002a2b1bdea9ab725) Thanks [@nasyrov](https://github.com/nasyrov)! - Reflect title, excerpt, meta, and template edits in the editor's visual canvas.

  The canvas iframe live-synced only block content over its bridge; the entry
  fields the theme template renders around the blocks — title, excerpt, meta,
  and a `named`-template pick — stayed at their load-time server render until a
  manual reload. Now, after such a field autosaves, the host reloads the canvas
  (debounced, coalescing a burst of edits into one reload; block content and the
  scroll position are preserved), so the theme output tracks the edit.

  Two paths fed the stale output, both fixed:

  - The host never signaled the canvas to refresh for these fields. `PlumixEditor`
    gains a `previewRefreshToken` the editor bumps after a title / excerpt / meta /
    template autosave; `CanvasFrame` reloads the iframe when it changes.
  - The `?preview=` render itself froze the title. `overlayPreviewAutosave` copied
    `title` from the autosave snapshot, overriding a later live title edit — but
    the title is a live field (written with `saveAs: "live"`, like slug / parent /
    terms, which already came from the live row). The preview now overlays only
    the drafted fields (content, excerpt, meta) and reads the title from live.

- [#1569](https://github.com/withplumix/plumix/pull/1569) [`112e1bd`](https://github.com/withplumix/plumix/commit/112e1bd6d0ab8f9579ef8a87651d3a996faf75b9) Thanks [@nasyrov](https://github.com/nasyrov)! - Treat the entry title as a live-only field on every read and write path.

  [#1544](https://github.com/withplumix/plumix/issues/1544) made the `?preview=` render read the live title, but three other paths
  still read the frozen autosave/revision snapshot, so the title diverged
  depending on where it was read:

  - `entry.publish` promoted the autosave's snapshot title onto the live row. A
    title edited on live after a content draft was written reverted to the stale
    snapshot on publish. Publish now leaves the live title untouched.
  - `entry.get` preview overlaid the snapshot title, so the editor form and the
    public preview could disagree. It now keeps the live title.
  - `entry.update`'s draft branch stored a caller-supplied title on the autosave
    row. It now anchors the snapshot column to the live title and ignores a
    drafted title (drafting a title independently of publishing is no longer a
    capability — the editor writes title straight to live with `saveAs: "live"`).
  - Restoring a revision onto an autosave-supporting type wrote the revision's
    title into the draft, where nothing read it back. It now anchors title to
    the live row, exactly like slug and parentId already do; only content,
    excerpt, and meta restore into the draft.

- Updated dependencies [[`976fc4d`](https://github.com/withplumix/plumix/commit/976fc4dc102529c25c6509da89e6bce151945dd5), [`077c515`](https://github.com/withplumix/plumix/commit/077c515e47d3e807d61b5ed4a0ff7cbc94839eff), [`741c6b4`](https://github.com/withplumix/plumix/commit/741c6b4b0c731e3fe8efd1c316a0ea4fd23b6e0d), [`ec117ea`](https://github.com/withplumix/plumix/commit/ec117ea45ed6ff064807ae2d6cee4dfb5b67cf35), [`9a1e88a`](https://github.com/withplumix/plumix/commit/9a1e88adb272f1f4795ddfd23e2958b4aa8b9443), [`6fe5583`](https://github.com/withplumix/plumix/commit/6fe5583954947ba11093fb053c946640b703b4b0), [`3d269a3`](https://github.com/withplumix/plumix/commit/3d269a399f6e36e499ef60846abe02716103d7a0), [`a5be41a`](https://github.com/withplumix/plumix/commit/a5be41a282fc4785c7cec582af0e97b3d99bed8a), [`f379b46`](https://github.com/withplumix/plumix/commit/f379b46b4c863bde6d4235a5753e7fd07926153c)]:
  - @plumix/blocks@0.8.0

## 0.7.0

### Minor Changes

- [#1536](https://github.com/withplumix/plumix/pull/1536) [`b7f3810`](https://github.com/withplumix/plumix/commit/b7f3810be8e72ba44d05f74fb663dec3c6cb906a) Thanks [@nasyrov](https://github.com/nasyrov)! - Enforces every declarative field constraint server-side through one generic walker over the field definitions, and addresses write rejections to the exact field (breaking, pre-1.0). The per-value pipeline is now coercion → `.sanitize()` (typed transform) → declarative constraints → `.validate()` (sync or async, `true` or an i18n-able message — executed for the first time). The walker covers required (previously a UI-only promise), `maxLength`, numeric and temporal bounds (temporal previously UI-only, now with stored-shape format checks), option membership and selection counts, row counts, and email/url/color/link format checks — replacing the per-factory hand-injected sanitizers on `range`, `color`, `select`, `link`, `richtext`, and `repeater`, so `.sanitize()` is purely the author's transform and can no longer disable a declared constraint. Failures aggregate across the whole patch into `CONFLICT.data.errors` as `{ path, message }` pairs — `path` dot-joins into nested repeater cells (`sections.2.heading`), `message` is a plain string or a message descriptor with its interpolation values — and the admin metabox form pins each onto the addressed input inline (term edit, user edit, and the entry editor's document panel). `sanitizeMetaInput`/`sanitizeMetaForRpc` are now async; sanitize callbacks that throw map to a path-addressed generic invalid error instead of carrying custom reasons (use `.validate()` for custom messages).

- [#1554](https://github.com/withplumix/plumix/pull/1554) [`4f5b96a`](https://github.com/withplumix/plumix/commit/4f5b96aeebd75f0dde824fbe763fe7c040094c9c) Thanks [@nasyrov](https://github.com/nasyrov)! - Validate entry meta leniently on draft saves and strictly on publish, so
  work-in-progress never fails to save while published content stays valid.

  The field pipeline gains a `draft` / `strict` mode. In `draft` mode the
  business-rule constraints — required, numeric / temporal bounds, `maxLength`,
  option membership, format checks, repeater / group row counts, and
  `.validate()` — are skipped; the structural + security gates (type coercion,
  shape normalization, `.sanitize()`, temporal validity, and the url safe-href
  check) always run, so a draft can never persist corrupt or unsafe data.

  Autosaves and draft-status writes use `draft`; anything that lands the entry
  as published or scheduled uses `strict`. Publishing re-validates the **whole**
  promoted bag against the full field list — catching a required field the
  draft left absent, not only one stored empty — and a violation aborts the
  publish with a per-field `CONFLICT` the admin pins onto its inputs. Fields the
  publisher lacks the capability to write are excluded from that gate, so a
  co-author's value can't block an unrelated publish.

  This reverses the previous behavior where autosave rejected incomplete content
  (the recurring "Couldn't save your changes — they may contain invalid content"
  failure while editing) and publish promoted a stored bag without re-checking
  its constraints.

- [#1534](https://github.com/withplumix/plumix/pull/1534) [`40d4221`](https://github.com/withplumix/plumix/commit/40d4221e6f880e7bc653ff948adc339f06a78d4b) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds conditional field visibility authored from field references: condition factories typed per driving field (`.is()`, `.gt()`, `.isOn()`, containment/count on multi-select) feed `.visibleWhen()`/`.orVisibleWhen()` groups that show/hide admin fields live and skip server-side validation of hidden fields.

- [#1529](https://github.com/withplumix/plumix/pull/1529) [`3171824`](https://github.com/withplumix/plumix/commit/3171824efeebd85a89ae2edcac86c7a379cc8b5f) Thanks [@nasyrov](https://github.com/nasyrov)! - New `link()` field on `plumix/fields`: a fluent CTA-shaped value (`{ url, label?, newTab? }`) with the full universal chain and phantom `LinkValue | undefined` typing (narrowed by `.required()`/`.default()`). The value's shape and URL are server-validated on write (site-relative path or WHATWG-parseable absolute URL; unknown properties stripped) ahead of any chained `.sanitize()`. The admin metabox control authors the URL by typing an external URL or picking a public internal entry — resolved to its permalink via the lookup RPC — with a link-text input and an open-in-new-tab switch.

- [#1532](https://github.com/withplumix/plumix/pull/1532) [`1501f42`](https://github.com/withplumix/plumix/commit/1501f42f2431290f5ecdfbe35035948c90733511) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders, part two (breaking, pre-1.0): the remaining eight scalar field constructors on `plumix/fields` — `number`, `range`, `date`, `datetime`, `time`, `color`, `richtext`, `json` — now author as immutable chained builders instead of flat option objects: `number("rating").min(1).max(5).step(0.5)`, `richtext("body").marks(["bold"]).nodes(["heading"])`. Per-type chains expose only the options that apply (`number(...).maxLength(...)` is a compile error); `range` requires `.min()`/`.max()` and enforces `min <= max` at registration; `color` and `range` keep their injected default sanitizers (a custom `.sanitize()` replaces them); `richtext` always injects the allowlist walker and deliberately offers no `.sanitize()`. Removed: the flat `NumberFieldOptions`/`RangeFieldOptions`/`DateFieldOptions`/`DateTimeFieldOptions`/`TimeFieldOptions`/`ColorFieldOptions`/`RichtextFieldOptions`/`JsonFieldOptions` types; `DateMetaBoxField`/`DateTimeMetaBoxField`/`TimeMetaBoxField` are now aliases of `TemporalMetaBoxField<I>`.

  New: `.returns("date")` on `date`/`datetime`/`time` projects the stored ISO string to a JS `Date` at decode time and the inferred read type follows (`Date | undefined`, narrowed by `.required()`/`.default()`); the default read stays the ISO string. Projected `Date`s anchor their wall-clock components to UTC (`date` at UTC midnight, `time` on 1970-01-01 UTC) so they survive any server/browser timezone split — read components back with `getUTC*` or `timeZone: "UTC"` formatting. Symmetrically, temporal fields now accept a `Date` on the write side and store the field's ISO shape from UTC components, so admin round-trips of projected values are lossless; `formatTemporalValue` on `@plumix/core/manifest` exposes the shared formatter.

- [#1531](https://github.com/withplumix/plumix/pull/1531) [`c067480`](https://github.com/withplumix/plumix/commit/c067480cb8ecb70d1be2a0ad6f26634bd919a2fd) Thanks [@nasyrov](https://github.com/nasyrov)! - Consolidates choice fields onto a fluent `select()` builder and adds `toggle()` (breaking, pre-1.0). `select("size").options(["s", "m"])` infers the option literal union as the value type; `.multiple()` flips reads to a readonly array and storage to a JSON array, unlocking selection-count `.max()`; `.appearance("select" | "radio" | "buttons" | "checkboxes")` picks the admin control without changing the value shape, and cardinality-illegal combinations are compile errors in either call order. `toggle()` renders the admin switch with `.onText()`/`.offText()` state labels and reads `boolean | undefined`, narrowed by `.required()`/`.default()`. Removes the flat `radio`, `multiselect`, and `checkbox` factories, their option types, and their wire variants — object literals using the retired `inputType` strings still compile via `LegacyMetaBoxField` and still render. `SelectMetaBoxField` becomes a `multiple`/`type`-correlated union, and the manifest wire carries `multiple`, `appearance`, `onText`, and `offText`.

- [#1527](https://github.com/withplumix/plumix/pull/1527) [`274a97c`](https://github.com/withplumix/plumix/commit/274a97c0c239ba1722965b00620e1ad91b54ef90) Thanks [@nasyrov](https://github.com/nasyrov)! - Fluent field builders (breaking, pre-1.0): the five string scalar field constructors on `plumix/fields` — `text`, `textarea`, `email`, `url`, `password` — now author as immutable chained builders instead of flat option objects: `text("subtitle").placeholder("…").maxLength(120)` replaces `text({ key, label, … })`. Labels default to the humanized key; the universal chain adds `.label()` (string or message descriptor), `.description()`, `.placeholder()`, `.prepend()`/`.append()`, `.default()`, `.required()`, `.span()`, `.capability()`, `.showInApi()`, `.sanitize()`, and `.validate()`, with phantom value typing (`string | undefined`, narrowed to `string` by `.required()`/`.default()`). Every `fields` registration surface (entry/term/user meta boxes, settings groups, repeater `subFields`) accepts builders alongside plain field definitions and compiles them at registration. `.span()` is accepted on every surface as a universal layout hint — the `EntryMetaBoxField` span-omit union is gone (the entry editor rail still ignores and strips the hint). Removed: the flat `TextFieldOptions`/`TextareaFieldOptions`/`EmailFieldOptions`/`UrlFieldOptions`/`PasswordFieldOptions` types; the five per-variant field interfaces are now aliases of `StringMetaBoxField<I>`. Repeater rows no longer feed absent (`null`/omitted) subfield values into sanitize callbacks, mirroring top-level deletion semantics.

- [#1538](https://github.com/withplumix/plumix/pull/1538) [`9087ed0`](https://github.com/withplumix/plumix/commit/9087ed0c9dfc720b5b3b135691bade4a9afbe28d) Thanks [@nasyrov](https://github.com/nasyrov)! - Read-time reference hydration is now cache-correct: a page that embeds a referenced entity carries that entity's cache tag and is purged when the entity changes. A per-request accumulator collects tags during hydration and the public read-through folds them into the page's stored cache tags, so editing, deleting, or otherwise changing an embedded entry busts the pages that hydrated it (the entry adapter contributes its precise `e:<id>` tag through the existing purge pipeline). Lookup adapters gain an optional `embeddedCacheTags(payload)` method to declare the tag a hydrated payload contributes; kinds without a per-entity purge identity (e.g. `user`) omit it. A new server-side `hydrateReferences(ctx, kind, ids, { scope })` helper gives themes the same batched adapter path and tag accounting for id-only reference fields, resolving an id set in one in-query per chunk and returning the hydrated payloads dense and in requested order. Pages that hydrate nothing are tagged exactly as before.

- [#1552](https://github.com/withplumix/plumix/pull/1552) [`f58edfb`](https://github.com/withplumix/plumix/commit/f58edfbfa4d743ec41143366da219160cfc3e9fb) Thanks [@nasyrov](https://github.com/nasyrov)! - Make the `range()` field's bounds compile-required. `range(key)` now returns a
  seed exposing only `.bounds(min, max)`, which returns the field builder — so
  forgetting the slider's `[min, max]` track is a type error rather than a runtime
  throw at registration. This mirrors the `select(key).options(...)` and
  `repeater(key).fields(...)` seed pattern.

  Breaking: `range("x").min(0).max(100)` becomes `range("x").bounds(0, 100)`
  (other chain methods are unchanged, and `min <= max` is still validated at
  registration).

- [#1535](https://github.com/withplumix/plumix/pull/1535) [`63afd4f`](https://github.com/withplumix/plumix/commit/63afd4f2a3f5e8197ba26b9145b75e52a548b61b) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields hydrate at read time (breaking, pre-1.0). Lookup adapters gain an optional batched `hydrate({ ids, scope })` contract; core's `entry`/`term`/`user` adapters resolve ids into public-safe summary shapes (`EntryReferenceSummary` with title/slug/url, `TermReferenceSummary`, `UserReferenceSummary` — never email/role), and the media adapter resolves a full media item including its URL, so themes can finally render a media meta field. Hydrated shapes are declared per kind in the merged `ReferenceHydrationShapes` registry, augmentable by plugins. The read pipeline (`hydrateMetaBags`, replacing `filterMetaOrphans`) runs hydration and orphan-stripping as one traversal: ids aggregate across all reference fields of all entries in a response and resolve with one in-query per `(kind, scope)` group — public render template data, admin oRPC reads, and REST projection all return hydrated values. Hydration is one level deep (a hydrated entry's own references stay ids), deleted referenced entities read as absent (single refs `null`, multi refs dropped, arrays stay dense), and kinds whose adapter predates `hydrate` keep the plain-id read shape. Unpublished referenced entries are clamped away from viewers without `edit_any` on the referenced type, so public render and anonymous REST never leak a draft's title through hydration. Hydrated values round-trip safely through writes — the sanitizer and the autosave merge heal `{ id, ... }` payloads back to plain ids. Admin reference pickers accept the hydrated object values and keep operating on ids.

- [#1553](https://github.com/withplumix/plumix/pull/1553) [`011174b`](https://github.com/withplumix/plumix/commit/011174b37b3015b033191e72426c5b7849c33df2) Thanks [@nasyrov](https://github.com/nasyrov)! - Polish the repeater row editor and fix a data-loss bug in its summary rail.

  - **New `repeater(...).dialogSize("sm" | "md" | "lg")`** sets the row-editor
    dialog width (`sm:max-w-lg` / `sm:max-w-2xl` / `sm:max-w-4xl`; default `md`).
    Widen it for dense, multi-column rows. Threaded core builder → manifest →
    admin like the existing `.layout()` / `.collapsed()` hints.
  - **Data loss on add / remove / reorder after editing a row is fixed.** The
    summary rail read the parent Controller's snapshot, which doesn't re-render
    when a subfield is edited inside the row dialog; the next structural change
    then committed an array missing the just-edited row's values. It now reads
    the live array via `useWatch`.
  - **Row-editor dialog no longer breaks layout when a field shows a validation
    message** — the grid stretched every sibling cell to the errored field's
    height and vertically centered their controls out of line; cells now
    top-align.
  - **Toggle fields render label-above** like every other grid field, so a
    toggle sharing a row with text / number inputs aligns on the input midline
    instead of floating at the siblings' label height.
  - The summary row's **Edit control is now an icon-only button** (was a
    text button that turned red on error); error state is conveyed solely by the
    warning indicator, and destructive styling is reserved for the remove button.
    Its accessible name is row-numbered ("Edit row 3") so a screen reader can
    tell the rows apart.

- [#1550](https://github.com/withplumix/plumix/pull/1550) [`0a185ba`](https://github.com/withplumix/plumix/commit/0a185baf413211727c36971e8880c2a670bede6d) Thanks [@nasyrov](https://github.com/nasyrov)! - Rework the metabox repeater UI. Rows previously crammed every field inline into
  the narrow document rail, ran tall, and dropped each subfield's `.span()`. Now
  each row is a compact, scannable summary (a label from the `.collapsed()`
  subfield or the first non-empty value) with an Edit button; editing opens a
  roomy dialog that lays the row's fields out on the same 12-column grid the box
  uses, honoring each subfield's `.span()`. Adding a row opens its editor
  directly, and a row whose fields hold a validation error is flagged so it's
  discoverable while the dialog is closed. Groups likewise lay their members out
  on a span-aware grid.

  Repeater and group subfields now carry their `span` on the manifest wire
  (previously dropped as "children are full-width", since the old inline rail
  couldn't honor it) so the composite editors can lay them out.

- [#1547](https://github.com/withplumix/plumix/pull/1547) [`3df62e3`](https://github.com/withplumix/plumix/commit/3df62e300348aa90bb8b4a9fd1883adf8e5c03ee) Thanks [@nasyrov](https://github.com/nasyrov)! - Add `EntryMeta` / `TermMeta` / `UserMeta` / `SettingsMeta` helper types for
  declaring typed-meta contributions. Instead of hand-writing the contribution
  shape, plugin authors write:

  ```ts
  import type { EntryMeta } from "plumix";

  declare module "plumix" {
    interface EntryMetaContributions {
      article: EntryMeta<"post", typeof articleFields>;
    }
  }
  ```

  The helpers fold identically to the raw `{ entryTypes; fields }` object but
  remove a silent-failure footgun — misspelling `entryTypes` left the
  contribution structurally valid yet unmatched by the read-type fold, so the
  fields read as absent with no error. The target-name generic is also
  constrained to registered entry types / taxonomies, surfacing an unknown
  target at the declaration itself. `EntryMeta`'s JSDoc carries the end-to-end
  walkthrough from declaring fields to typed `forEntryType(...).template(...)`
  reads.

- [#1530](https://github.com/withplumix/plumix/pull/1530) [`a55a17c`](https://github.com/withplumix/plumix/commit/a55a17cfb577b8e5f21b428496bd2a0d76b9fffd) Thanks [@nasyrov](https://github.com/nasyrov)! - Typed meta reads (breaking, pre-1.0): declared fields now flow into typed reads everywhere via contribution-keyed registries. Augment `EntryMetaContributions` / `TermMetaContributions` / `UserMetaContributions` (keyed by box id) or `SettingsContributions` (keyed by group name) with `{ entryTypes: "post"; fields: typeof myFields }`, and `MetaOf<K>` / `TermMetaOf<K>` / `UserMetaOf` / `SettingsOf<Name>` fold every contribution targeting `K` into one closed record — a mistyped field name is a compile error in the theme. Targeted templates (`forEntryType(...)`, `forTermTaxonomy(...)`) receive entries and terms with the folded typed `meta` (`ResolvedEntryFor<K>` / `ResolvedTermFor<K>`), and `whereMeta` keys/values are typed against the distinct stored shapes (`StoredMetaOf<K>` / `StoredTermMetaOf<K>` via `InferStoredFields` — `.default()` narrows only the read shape). When a contribution declaration exists for a box id, the matching `register*` call is typechecked against it (target set and fields must match); a missing declaration degrades to absence from the typed record and can be supplied from any package via interface merging. Removed: the `meta` projection slot on `EntryTypeRegistry` / `TermTaxonomyRegistry` — `MetaOf`/`TermMetaOf` no longer read it and no longer fall back to an open `Record<string, unknown>`, so `whereMeta` on a type with no declared contributions accepts no keys.

- [#1551](https://github.com/withplumix/plumix/pull/1551) [`e9a14b1`](https://github.com/withplumix/plumix/commit/e9a14b18460915e8aa210047d63f5d6097b3b24a) Thanks [@nasyrov](https://github.com/nasyrov)! - Entries can be created and saved untitled. A new entry is no longer seeded with
  a literal "Untitled" title the author has to delete (typing prepended onto it) —
  `entry.create`'s title is now optional (stored as `""`), `entry.update` accepts
  an empty title (to clear it), and the editor's title field shows a placeholder.

  Read surfaces render a fallback for the empty title: the public `<title>` and
  feeds fall back to the site name / a fixed label, and the admin entry lists,
  dashboard, and command palette show "(no title)" instead of a blank row.

  Also fixes an unset single-select (`appearance: "buttons"`) that could appear to
  highlight its first option when no value is set — it now shows no selection,
  matching the radio control.

### Patch Changes

- [#1533](https://github.com/withplumix/plumix/pull/1533) [`7d5d664`](https://github.com/withplumix/plumix/commit/7d5d664dca8c1fb726b9fc7f1607b3ad41d26708) Thanks [@nasyrov](https://github.com/nasyrov)! - The `entry.update` autosave route now runs the same meta gate as a live write — field sanitizers, field-level capability checks, and reference validation — before persisting the autosave bag. Previously raw client meta was stored on the autosave row and `entry.publish` promoted it verbatim onto the live entry, so declared sanitizers (e.g. `color()`'s hex lowercasing) never ran, capability-gated fields could be written by autosaving then publishing, and dangling reference ids reached the published row. A `null` meta value on autosave now deletes the key on promotion (matching live-write delete semantics) instead of persisting a literal `null`.

- [#1543](https://github.com/withplumix/plumix/pull/1543) [`864aa9a`](https://github.com/withplumix/plumix/commit/864aa9aef5dc3b950c3a65057cb65b9b88e3a797) Thanks [@nasyrov](https://github.com/nasyrov)! - Entry autosave no longer silently drops meta edits. The editor and plain-form now send only the changed meta keys, so a key the editor doesn't own (e.g. a `featuredImage` written by another plugin) is never re-validated and can't fail the whole write with `meta_not_registered`. The autosave row now accumulates content/excerpt/meta on the existing draft instead of rebasing on the live row on every write, so a partial autosave no longer drops a key an earlier one set — title stays anchored to the live row, which the editor writes it to directly. Both editor debouncers are serialized through one save queue so they can't race the shared optimistic-concurrency token into `409` conflicts, a recovered stale conflict retries once instead of surfacing a failure, and a deletion of an unregistered meta key is now a harmless no-op.

- [#1539](https://github.com/withplumix/plumix/pull/1539) [`4617ca9`](https://github.com/withplumix/plumix/commit/4617ca9b66873d4c83debe78f8d7f2a3b58e2479) Thanks [@nasyrov](https://github.com/nasyrov)! - `entry.publish` now re-sanitizes the registered meta keys of the autosave bag before promoting it onto the live row, rather than promoting verbatim. The write-time gate (previous release) only canonicalizes autosaves written after it deployed; a draft persisted before that fix could still carry unsanitized values onto a published entry. The publish path now runs each registered field's `.sanitize()` pipeline and passes unregistered keys (data from uninstalled plugins) through untouched, so it never rejects a legitimate live bag as `meta_not_registered`. The gate is forgiving like the read path: because a whole bag is promoted rather than a caller's touched patch, a value that fails validation is treated as schema drift and kept as stored rather than aborting an unrelated publish — the live write path remains the gate for user intent. Field capabilities and reference existence are intentionally not re-checked at publish.

- [#1548](https://github.com/withplumix/plumix/pull/1548) [`538d64d`](https://github.com/withplumix/plumix/commit/538d64d4cf0767f4302e3287ebb8c1b752105027) Thanks [@nasyrov](https://github.com/nasyrov)! - Render the metabox `richtext()` field as a real Tiptap editor instead of a raw-JSON textarea.

  The block editor's rich-text editor is now shared: it gained a JSON serialization mode (reads/writes the ProseMirror doc the field stores) and an optional marks/nodes allowlist that constrains both the editor schema and the toolbar, so a field authored with `.marks(["bold","link"]).nodes(["heading"])` only offers — and can only produce — the formatting it declares. The block editor's own usage is unchanged (HTML serialization and the full toolbar remain its defaults). The editor is code-split, so forms without a richtext field never load the ProseMirror chunk.

  Also fixes the server-side richtext validator to implicitly allow `hardBreak` and `listItem`: the shared editor always ships a Shift+Enter line break, and any allowed list carries list items, so a natural `.nodes(["bulletList"])` field could previously produce content its own editor offered but the server then rejected on save.

- Updated dependencies []:
  - @plumix/blocks@0.7.0

## 0.6.0

### Minor Changes

- [#1526](https://github.com/withplumix/plumix/pull/1526) [`bcd76ed`](https://github.com/withplumix/plumix/commit/bcd76ed4240f30daa79a2a421d042d2afb6f9aa3) Thanks [@nasyrov](https://github.com/nasyrov)! - Reference meta fields now store plain ids (or id arrays) — the write-time snapshot machinery is gone: the object value-shape (`ReferenceTarget.valueShape`), the adapter cached-fields seam (`LookupResult.cached`), and the write-time cached-reference rewrite are all removed. Values stored under the old `{ id, ... }` shape self-heal transparently: reads yield the id, and the entity's next save persists the plain form. `LookupResult` gains a first-class `href` (entry permalink / term archive) that menu resolution reads directly. The media `media()` / `mediaList()` builders drop the `MediaValue` type (`default` is now an id / id array), and the admin media pickers resolve labels through the batched lookup path instead of stored snapshots.

- [#1520](https://github.com/withplumix/plumix/pull/1520) [`902a922`](https://github.com/withplumix/plumix/commit/902a922b8dc5652700cc9cbbb8f00726b34a482c) Thanks [@nasyrov](https://github.com/nasyrov)! - Repeated reads dedupe within a request through a new request-scoped read-through memo on `ctx` (`ctx.memo`, plus a `memoBatch` helper for per-id memoization over one batched query). The hot single-row lookups now read through it inside the existing service functions: the `site` settings group (head defaults, SEO surfaces, and the settings template dep share one query), author rows in `buildResolvedEntries`, the entry-type probe (new shared `readEntryType`, deduping the comments template dep against the blog related-posts loader), and the menu query cluster (shared between the `menus` template dep and `getMenuForLocation`, which now rides `ctx.memo` instead of a bespoke WeakMap). `plumix/test` gains `createTracedContext` and `createRequestMemo` for query-count assertions and `AppContext` stand-ins.

- [#1521](https://github.com/withplumix/plumix/pull/1521) [`75ef282`](https://github.com/withplumix/plumix/commit/75ef282365fc02cf9520494e3f757cf5a6879880) Thanks [@nasyrov](https://github.com/nasyrov)! - New `@plumix/core/telemetry-otel` subpath: `otelConsumer(...)` is an OTel trace exporter as a telemetry consumer. One entry in `telemetry.consumers` ships each collected request's span waterfall to any OTLP/HTTP backend (Grafana Cloud Tempo, a local otel-collector, …) as an `ExportTraceServiceRequest` — root `SERVER` span from the request envelope with HTTP semconv attributes, the collected span tree as `INTERNAL` children (ids minted at export time), records as root-span events, errors as `STATUS_ERROR` plus `exception` events, and cap-dropped counts surfaced. Supports head sampling (`sample` ratio), tail sampling (`tailSample` on the finished snapshot), and joining a caller's trace via an inbound W3C `traceparent`. Exports run per request from `waitUntil`; failures are logged, never surfaced to the request path. Zero dependencies — the OTLP/JSON payload is hand-rolled to stay Workers-lean.

- [#1517](https://github.com/withplumix/plumix/pull/1517) [`af1af74`](https://github.com/withplumix/plumix/commit/af1af74a925ea4ba5f8ab1c153a466a13195ad68) Thanks [@nasyrov](https://github.com/nasyrov)! - Telemetry now covers the remaining span-tree interiors and platform I/O slots. The `render` phase gains child spans for its previously invisible tail: `render: deps` (template-dep loaders), `render: head` (SEO gap-fillers), `render: loaders` (block loader prefetch), and `render: react` (the `renderToString` pass) — error-page renders included. The platform I/O slots are wrapped once at context assembly, mirroring `ctx.fetch`: `cache: match`/`cache: put`, `assets: fetch`, `storage: put|get|head|delete|list`, and `mailer: send` spans now appear for every consumer. Note `ctx.assets`/`ctx.storage`/`ctx.cache`/`ctx.mailer` are no longer the configured objects by identity — they are interface-preserving traced wrappers, so code stashing extra properties on a custom slot object and reading them back off `ctx` must keep a direct reference instead. Span coverage and deliberate exclusions are documented in `docs/telemetry.md`.

### Patch Changes

- [#1513](https://github.com/withplumix/plumix/pull/1513) [`f737d54`](https://github.com/withplumix/plumix/commit/f737d54854c422ad564c98649b58c2a259f8322b) Thanks [@nasyrov](https://github.com/nasyrov)! - Static-asset 404s (the short-circuit for `favicon.ico`, `/assets/*` and friends) now carry `Cache-Control: public, max-age=300`, so browsers and CDNs absorb repeated probes instead of invoking the worker each time. Safe to cache because the extension check makes these paths permanently unroutable; the TTL only bounds how long a freshly deployed asset can be shadowed. Content 404s remain uncacheable.

- [#1498](https://github.com/withplumix/plumix/pull/1498) [`642dcf6`](https://github.com/withplumix/plumix/commit/642dcf6b2cd42e4f9aca5ddf007dc3f6b1f7f613) Thanks [@nasyrov](https://github.com/nasyrov)! - Stops asset-shaped 404s from paying route resolution and a themed render. A public request whose path ends in a static-asset extension (`.ico`, `.css`, `.js`, images, fonts, `.map`, `.wasm`) short-circuits to a plain-text 404 before the route map runs — previously a stray `favicon.ico` or `/assets/*` miss ran a page-slug lookup plus the full themed 404 page (~9 DB queries per request). Content-plausible extensions (`.txt`, `.xml`, `.json`, `.html`) stay routable.

  Two related error-path changes:

  - A 404 or 500 for a client whose `Accept` header negotiates away from HTML (e.g. `application/json`) now returns the plain-text error instead of the themed page. Browser-shaped requests, a missing `Accept`, and `*/*` keep the themed render.
  - `renderErrorThroughTheme` now opens a `render` telemetry span like the happy path, so error-page queries no longer dangle directly under `dispatch` in traces.

- [#1524](https://github.com/withplumix/plumix/pull/1524) [`d6c456a`](https://github.com/withplumix/plumix/commit/d6c456a6bf365f492a7024bf7a83da77d006b8d7) Thanks [@nasyrov](https://github.com/nasyrov)! - On subdirectory mounts (`basePath`), asset-shaped requests outside the base — above all the browser's root `/favicon.ico` probe — now get the same cacheable plain 404 (`Cache-Control: public, max-age=300`) as in-base asset misses, instead of an uncacheable worker-invoking 404. Out-of-base paths can never be routed by the app, so the cacheability argument is strictly stronger than for in-base misses; non-asset out-of-base 404s remain uncacheable.

- [#1515](https://github.com/withplumix/plumix/pull/1515) [`4c9205a`](https://github.com/withplumix/plumix/commit/4c9205a8dfadfd9b54983b032e234bf4c7ab9ec8) Thanks [@nasyrov](https://github.com/nasyrov)! - Stops `plumix dev` from emitting a stale bundled-CSS link on every page. A prior `plumix build` leaves the asset manifest on disk; its hashed stylesheet URLs are not served by the dev server, so each page view triggered one extra 404 request. Bundled CSS links now emit only in build — dev styling already arrives via the theme-styles client entry.

- [#1523](https://github.com/withplumix/plumix/pull/1523) [`dad17a3`](https://github.com/withplumix/plumix/commit/dad17a3f71a8881b5b5ed1dbd387c0f8d2aa520e) Thanks [@nasyrov](https://github.com/nasyrov)! - The entry lookup-adapter scope can now express a status constraint (`scope: { entryTypes, status: "published" }`), pushed into the adapter's own `WHERE`. The menu resolver's published pre-filter query is gone — entry refs resolve in a single batched read instead of two back-to-back queries over the same ids on every public render. The admin picker keeps the current default (no status constraint, drafts admitted).

- Updated dependencies []:
  - @plumix/blocks@0.6.0

## 0.5.0

### Minor Changes

- [#1477](https://github.com/withplumix/plumix/pull/1477) [`7ddd056`](https://github.com/withplumix/plumix/commit/7ddd056a28538719094263c21c4476ec0e203aa5) Thanks [@nasyrov](https://github.com/nasyrov)! - Let users edit their author slug from the admin profile / user-edit screen. The `users.slug` behind `/authors/{slug}` was auto-derived and immutable; `user.update` now accepts a `slug` field, validated with the shared `slugSchema`.

  Unlike the auto-dedup used at creation, an explicit edit surfaces a collision as `CONFLICT { reason: "slug_taken" }` (mirroring the entry-create flow) rather than silently appending a numeric suffix. Any user can edit their own slug (`user:edit_own`); admins can edit anyone's (`user:edit`). The user-edit form gains an "Author slug" field with copy warning that changing it breaks existing `/authors/` links.

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

- [#1495](https://github.com/withplumix/plumix/pull/1495) [`b3ad524`](https://github.com/withplumix/plumix/commit/b3ad5247e8dcfd6c2adaeb03f0e22c8a5b5e530d) Thanks [@nasyrov](https://github.com/nasyrov)! - Telemetry coverage sweep: every execution path now produces a full span tree through `ctx.telemetry` ([#1485](https://github.com/withplumix/plumix/issues/1485)).

  - Phase spans carry attributes: `dispatch` records the response status; `resolve` records the route intent, resolved entity, and matched template (stamped even when the render throws); `render` records the resolved node.
  - New spans at existing choke points: auth/session resolution (`auth` span with outcome + user id at every authenticate site, bearer included), per-handler hook execution (`hook: <name>` with `hook.plugin`, on the async `applyFilter`/`doAction` pipelines), and per-task cron runs (`cron: <id>`).
  - Edge-cache decisions are recorded as durationless `cache` facts: `hit`, `miss` (+ whether stored), or `bypass` with the failing gate as `reason`.
  - MCP `tools/call`, REST, and admin RPC dispatch each produce a named span per tool/procedure; scheduled runs deliver their own snapshot post-run (the Cloudflare adapter now passes the telemetry config to the scheduled context).
  - New `ctx.requestId`, minted at context creation and reused as the snapshot envelope's `requestId`, so mid-request consumers and the finished snapshot correlate on one id.

- [#1489](https://github.com/withplumix/plumix/pull/1489) [`7455fa6`](https://github.com/withplumix/plumix/commit/7455fa68660a5f9ad85e8c6d5a728c747990289c) Thanks [@nasyrov](https://github.com/nasyrov)! - Add `ctx.fetch` — traced outbound HTTP. Same signature as global `fetch`; every call produces one telemetry span named `fetch: <METHOD> <host>` with OTel-mappable attributes (`http.request.method`, `url.full`, `http.response.status_code`), nested under the enclosing span. A rejecting fetch marks its span `status: "error"` with the serialized failure before the rejection propagates unchanged.

  Core and plugins should make external calls through `ctx.fetch` so slow third-party APIs show up in the request waterfall. Bare global `fetch` remains an untraced, unpatched platform boundary — the same line drawn for DB connections not obtained from `ctx.db`. W3C trace-context propagation (`traceparent` injection) is deferred to the future OTel exporter.

- [#1490](https://github.com/withplumix/plumix/pull/1490) [`5776069`](https://github.com/withplumix/plumix/commit/5776069d17ae9370c4a82c13f57150dfdf409009) Thanks [@nasyrov](https://github.com/nasyrov)! - Unifies automatic DB query tracing: every query flowing through `ctx.db` — libsql, D1, the demo runtime, and statements inside transactions — now appears in the telemetry snapshot as one `db: <kind>` span with `db.sql`, `db.params` (lazy, JSON-safe), and `db.rows` attributes, regardless of whether core or a plugin issued it.

  - One wrap at client construction per driver: `traceSqlClient` (libsql `execute`/`batch`/`transaction`), a new `traceD1Client` in the Cloudflare runtime (prepared statements, batches, and drizzle's emulated begin/commit transactions — timed for the first time), and the demo Durable-Object proxy callbacks. Batches are one round-trip and one span, carrying per-statement sql/params under `db.batch` and the summed row count.
  - Tracing is unconditional — no `PLUMIX_DEV` gate. Without an active collector (no consumer sampled the request) every span is a pass-through no-op, so production without telemetry consumers pays nothing; with a prod consumer registered, query spans now flow to it.
  - The drizzle-logger half of the old dual mechanism is deleted: `createDebugSqlLogger` is gone from `@plumix/core`, and the Database debug-bar panel renders from query spans (now with per-query durations) instead of the removed record channel. New shared helpers `traceDbQuery`/`traceDbBatch` are exported for runtime adapters.
  - DB connections not obtained from `ctx.db` remain an untraced platform boundary.

### Patch Changes

- Updated dependencies []:
  - @plumix/blocks@0.5.0

## 0.4.0

### Minor Changes

- [#1471](https://github.com/withplumix/plumix/pull/1471) [`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e) Thanks [@nasyrov](https://github.com/nasyrov)! - Add author archives end-to-end: `/authors/{slug}` renders a paginated list of a given author's published entries, themeable like any other archive.

  The full seam is wired: a new `author` `RouteIntent`, framework routes for `/authors/:slug` (+ `/page/:n`), a `resolveAuthor` resolver (the author's published, public-type entries — unknown slug or out-of-range page → 404), an `author` `ResolvedNode`, a generic `author()` template tier, a `forAuthor(slug)` / `forAuthor(id)` targeted builder, and a typed `AuthorArchiveData { author; entries; pagination }`. An author RSS/Atom feed is served at `/authors/{slug}/feed`, and author-archive pages advertise it via `<link rel="alternate">`.

  ```ts
  defineTheme({
    templates: [
      author(AuthorArchive), // every author archive
      forAuthor().slug("jane").template(JaneArchive), // one author, by slug
      forAuthor().id(1).template(FounderArchive), // or by id
    ],
  });
  ```

  Authors are addressed by a new **`users.slug`** column (globally unique, mirroring `terms.slug` / `entries.slug`). It is derived from the user's name via `slugify` at creation — falling back to `user`, de-duplicated with a numeric suffix (`jane`, `jane-1`, `jane-2`), and never derived from the email — and is stable across later name changes. `ResolvedAuthor` now carries `slug`, so `data.author` / `entry.author` can link to an author archive.

- [#1474](https://github.com/withplumix/plumix/pull/1474) [`e96e27d`](https://github.com/withplumix/plumix/commit/e96e27d5b6e378fb049431871386c7dcc643bff1) Thanks [@nasyrov](https://github.com/nasyrov)! - Add date archives end-to-end: `/YYYY`, `/YYYY/MM`, and `/YYYY/MM/DD` render paginated lists of entries published in that period.

  The same seam as author archives: a `date` `RouteIntent`, numeric-constrained framework routes for the three granularities (+ `/page/:n`), a `resolveDate` resolver (a half-open `publishedAt` range query — an empty period renders the archive, an impossible date like Feb 30 or an out-of-range page → 404), a `date` `ResolvedNode`, a generic `date()` template tier, a `forDate(year[, month[, day]])` targeted builder, and a typed `DateArchiveData { year; month; day; entries; pagination }`. RSS/Atom feeds are served at `/YYYY[/MM[/DD]]/feed` and advertised on the archive page via `<link rel="alternate">`.

  ```ts
  defineTheme({
    templates: [
      date(DateArchive), // every date archive
      forDate(2026).template(YearInReview), // the /2026 year archive
      forDate(2026, 12, 25).template(Holiday), // the /2026/12/25 day archive
    ],
  });
  ```

  `forDate` matches one exact granularity — `forDate(2026)` targets the year archive, not that year's month/day archives.

- [#1475](https://github.com/withplumix/plumix/pull/1475) [`0ad5a4b`](https://github.com/withplumix/plumix/commit/0ad5a4bd85c8a57b2fe4cc6bc8803795775c6140) Thanks [@nasyrov](https://github.com/nasyrov)! - Let plugins register their own archive types — a URL pattern set + resolver + typed data + builder + feed — with no core changes, opening the previously-closed `RouteIntent`/resolver seam.

  `ctx.registerArchiveType(name, { routes, resolve, feed? })` adds a whole archive: matched URLs dispatch to the resolver (which returns `{ data, title }` or `null` → 404), and the data templates through `forArchiveType(name)` — a targeted builder that autocompletes and types `data` from an augmentable `ArchiveTypeRegistry`, exactly like `forEntryType` / `forTermTaxonomy`.

  ```ts
  // plugin
  ctx.registerArchiveType("event-series", {
    routes: ["/events/:series", "/events/:series/page/:page(\\d+)"],
    resolve: (ctx, params) =>
      params.series
        ? { data: { kind: "custom", name: "event-series", series: params.series, ... }, title: `…` }
        : null,
    feed: { routes: ["/events/:series/feed"], filter: (ctx, params) => /* SQL | null */ },
  });

  // typing (declare once)
  declare module "@plumix/core" {
    interface ArchiveTypeRegistry {
      "event-series": { data: EventSeriesData };
    }
  }

  // theme
  defineTheme({ templates: [forArchiveType("event-series").template(EventArchive)] })
  ```

  The five built-in archives (single/archive/taxonomy/author/date) are unchanged and keep working — the generalization adds a `custom` `RouteIntent` + `ResolvedNode` kind alongside them.

  Also reworks the feed subsystem: a registered archive can own an RSS/Atom feed (its base route serves both formats), and **nested-term feeds no longer 404** — a nested term's feed is served at its nested path (`/region/europe/france/feed`) when the taxonomy exposes hierarchical URLs.

- [#1469](https://github.com/withplumix/plumix/pull/1469) [`39b02e8`](https://github.com/withplumix/plumix/commit/39b02e8595e2d28291014d47bfa8f65d16f976f2) Thanks [@nasyrov](https://github.com/nasyrov)! - Give `forTermTaxonomy` the same predicate/named-template selectors `forEntryType` already has, so a template can target term archives by term meta or an arbitrary predicate:

  ```ts
  defineTheme({
    templates: [
      forTermTaxonomy("category")
        .whereMeta("featured", true)
        .template(FeaturedArchive),
      forTermTaxonomy("category")
        .where((data) => data.term.meta.pinned === 1)
        .template(PinnedArchive),
      forTermTaxonomy("category")
        .named("spotlight", "Spotlight")
        .template(Spotlight),
    ],
  });
  ```

  `whereMeta` keys and values are typed against the taxonomy's meta projection (declare `meta` in `TermTaxonomyRegistry` alongside `registerTermTaxonomy`, exported as `TermMetaOf<K>`); `where` receives the resolved `TaxonomyData`; `named` registers an author-selectable term template matched from stored term meta. Like entry predicates, a term predicate rule never matches when the resolved data is absent.

### Patch Changes

- Updated dependencies [[`47ec8e2`](https://github.com/withplumix/plumix/commit/47ec8e293dc3c0dd54da34c63c449182a302745e)]:
  - @plumix/blocks@0.4.0

## 0.3.0

### Minor Changes

- [#1456](https://github.com/withplumix/plumix/pull/1456) [`4cdb59e`](https://github.com/withplumix/plumix/commit/4cdb59ed70c2d83d5b1461a754970709cba92910) Thanks [@nasyrov](https://github.com/nasyrov)! - Redesign the theme template system around a typed, array-based `templates` model with router-style resolution.

  A theme's `templates` is now an **array of rules** built with typed helpers instead of a slug-keyed object. Generic tiers are direct builders — `fallback`, `entry`, `archive`, `taxonomy`, `frontPage`, `search`, `notFound`, `serverError` — and targeted rules are built with `forEntryType(name)` / `forTermTaxonomy(name)`, which autocomplete against the registered types, reject typos at compile time, and type `data.entry` / `data.term`:

  ```ts
  defineTheme({
    templates: [
      fallback(HomeAndArchives),
      entry(Post),
      forEntryType("page").template(Page),
      forEntryType("post").whereMeta("featured", true).template(FeaturedPost),
      forTermTaxonomy("category").slug("news").template(NewsArchive),
      notFound(NotFound),
    ],
  });
  ```

  Resolution follows a Laravel-router model: targeted rules in declaration order (first match wins), then the generic tier for the resolved node, then `fallback`. When nothing matches and there is no `fallback`, the request renders the 404 — a missing `fallback` is the "render-all vs. 404-on-miss" lever, not an error. Augment `EntryTypeRegistry` / `TermTaxonomyRegistry` alongside `registerEntryType` / `registerTermTaxonomy` to teach the builders your own types.

  The dev debug bar's Template panel now shows the full resolution walk for each request — every rule with a matched / skipped / never-evaluated status and its predicate outcome — so it's clear why a page got the template it did.

  **Breaking changes** (theme and plugin authors):

  - `templates` must be a `TemplateRule[]` (or a bare component as fallback shorthand). The slug-keyed object form (`{ index, single, "single-post", "404", … }`) is removed. Map old slots to builders: `index` → `fallback`, `single` → `entry`, `single-<type>` → `forEntryType("<type>").template`, `archive` → `archive`, `<taxonomy>` → `forTermTaxonomy(...)`, `404`/`500` → `notFound`/`serverError`.
  - The `notFound` export from `@plumix/core` / `plumix` is now the 404 **template builder**, not the HTTP `Response` helper (which is internal). Build error responses your own way.
  - `defineTemplate`'s `prefetchListingLoaders` field is renamed to `prefetchArchiveLoaders`.
  - The `template:hierarchy` hook filter is removed; template targeting is compile-time via the builders.

### Patch Changes

- Updated dependencies []:
  - @plumix/blocks@0.3.0

## 0.2.0

### Minor Changes

- [#1422](https://github.com/withplumix/plumix/pull/1422) [`1ff209a`](https://github.com/withplumix/plumix/commit/1ff209a56b1ed3d78e8a6eedb73ceaec056b588d) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a development-only debug bar.

  Running `plumix dev` now renders a per-request debug bar, inspired by the
  WordPress Debug Bar and framework devtools. It is compiled out of production
  builds entirely (gated on `process.env.PLUMIX_DEV`), so it ships nothing to
  production.

  Panels cover the current **Request** (method, path, origin, and the
  authenticated user + token scopes), the resolved **Template** hierarchy (the
  ordered candidate list and which one won), **Database** queries (SQL syntax
  highlighting with the bound params shown separately), an **App** tab
  consolidating the site's static setup (config, locale, wired slots, installed
  plugins, and registered content types), and a **Timeline** waterfall of the
  request's spans — dispatch, resolve, render, and each database query, timed and
  nested by call structure.

  The bar is zero-JS (a server-rendered `<details>` element with CSS-driven tabs)
  and extensible: plugins add panels through the `debug_bar:panels` hook and
  record data through the request-scoped `ctx.debug` collector. Configure it via
  `debugBar` (enable/disable, position, which panels to hide). On Cloudflare, D1
  queries are surfaced in the Database and Timeline panels as well.

### Patch Changes

- Updated dependencies []:
  - @plumix/blocks@0.2.0

## 0.1.4

### Patch Changes

- [#1409](https://github.com/withplumix/plumix/pull/1409) [`9467449`](https://github.com/withplumix/plumix/commit/9467449d397f65ede387c83883f46c0f3064cc2f) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix the visual editor being unusable under the Cloudflare demo runtime (and behind any non-cookie authenticator). Public-route renders only loaded the signed-in user when the standard `plumix_session` cookie was present, so a session established by a different signal — the demo's `plumix_demo` cookie, or Cloudflare Access's JWT header — rendered as anonymous. That left the editor's canvas iframe without its runtime, so blocks couldn't be selected, inserted, edited, or moved and the canvas wouldn't pan. Authenticators can now declare an optional `hasSession(request)` predicate so public renders recognise their sessions; the built-in demo and Cloudflare Access guards implement it. Also stops the demo toolbar pill from leaking into the editor canvas.

- Updated dependencies []:
  - @plumix/blocks@0.1.4

## 0.1.3

### Patch Changes

- [#1360](https://github.com/withplumix/plumix/pull/1360) [`c37b6db`](https://github.com/withplumix/plumix/commit/c37b6dba1913322aabc85e9b2876b433efe73351) Thanks [@nasyrov](https://github.com/nasyrov)! - Accept same-origin requests in the RPC/auth CSRF origin check. The check compared the request `Origin` against the canonical `app.origin` (from `auth.passkey.origin`); a deploy served on a different host than its configured origin — including the demo sandbox, whose origin varies per deploy — failed with `csrf_origin_mismatch` on every admin request. A request whose `Origin` equals the host it targets is not cross-site forgery, so it now passes the origin check. The `X-Plumix-Request` header gate remains the primary CSRF defense, and cross-origin requests are still rejected.

- [#1358](https://github.com/withplumix/plumix/pull/1358) [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a `virtual:plumix/worker-exports` codegen seam so a runtime adapter can contribute named exports — such as a Durable Object class — to the generated Cloudflare worker via `RuntimeAdapter.workerExports`. Core never learns about any specific feature; the seam is reusable by any future Durable Object, queue, or realtime adapter.

  The `auth.session` procedure now resolves the current user through the configured authenticator instead of a hardcoded session cookie, so custom authenticators (SSO, the demo sandbox) report the signed-in user on boot. The default cookie-backed behavior is unchanged.

- Updated dependencies []:
  - @plumix/blocks@0.1.3

## 0.1.2

### Patch Changes

- [#1333](https://github.com/withplumix/plumix/pull/1333) [`b493fbb`](https://github.com/withplumix/plumix/commit/b493fbb4b3cefec54322ea54023129b4ce1d1139) Thanks [@nasyrov](https://github.com/nasyrov)! - `r2()` and `images()` now resolve their configuration from the per-request env
  by convention, so a Cloudflare deploy's `plumix.config.ts` stays declarative
  instead of reading `process.env` at module load (which is empty on Workers).

  - `r2({ binding })` reads S3 presigned-upload credentials (`CF_ACCOUNT_ID`,
    `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `<BINDING>_BUCKET`) and
    `publicUrlBase` (`<BINDING>_PUBLIC_URL_BASE`) from the request env when the
    corresponding config slots are omitted. Explicit config always wins;
    presigned uploads stay disabled until all four credentials are present.
  - `images()` is now callable with no arguments and gains an optional
    `connect(env)` step, resolving its zone from `MEDIA_PUBLIC_URL_BASE` at
    request time and passing sources through untouched until that host is set.
  - `@plumix/core`'s `ImageDelivery` interface gains an optional `connect(env)`
    so runtimes can bind env-time image configuration.

  Backward compatible: existing explicit `r2({ ..., s3, publicUrlBase })` and
  `images({ zone })` configs are unchanged.

- Updated dependencies []:
  - @plumix/blocks@0.1.2

## 0.1.1

### Patch Changes

- [#1319](https://github.com/withplumix/plumix/pull/1319) [`843a184`](https://github.com/withplumix/plumix/commit/843a184ea755722f5b9d83664574eaf6ada97045) Thanks [@nasyrov](https://github.com/nasyrov)! - Bump runtime dependencies: radix-ui, lucide-react, and valibot (admin UI and validation), and markdown-it (comment rendering).

- Updated dependencies []:
  - @plumix/blocks@0.1.1
