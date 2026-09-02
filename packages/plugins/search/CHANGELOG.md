# @plumix/plugin-search

## 0.1.0

### Minor Changes

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

- [#2143](https://github.com/withplumix/plumix/pull/2143) [`ebf73e7`](https://github.com/withplumix/plumix/commit/ebf73e76f840a11afb543c608a850798d0a05df1) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `@plumix/plugin-search`, which keeps a full-text index of everything a site publishes.

  Installing it materializes a plain-text projection of every searchable entry — `search_documents` — and an
  SQLite FTS5 index over that projection. Nothing queries the index yet; the public results page, ranking
  and snippets follow.

  Both boundaries where the index could drift from the content are closed by triggers in the database.
  Core's entry change feed records what changed on one side, the projection's own triggers push into the
  index on the other, and only the middle hop runs in JavaScript — because stripping HTML out of a block
  tree needs a language SQLite does not have. A seed, a migration, a bulk import or any other write that
  never reaches the application is therefore still indexed.

  Saving an entry through the application indexes it after the response is sent, so a visitor never waits
  for the work, and the entry is findable without a scheduled run. Whatever that path misses is caught when
  the feed is next drained on the site's scheduled trigger; the drain is bounded per invocation so a backlog
  spreads across several rather than running one past the platform's limits.

  A save that leaves the text where it was writes nothing. The feed's guard ignores a metadata-only update,
  and the projection's upsert carries a `DO UPDATE … WHERE` that no-ops when the extracted text has not
  moved — so nothing re-tokenizes and a bulk status change stays cheap.

  The projection carries the source it was extracted from as a `source_type` / `source_id` pair, so terms can
  join the same index later without a migration and one ranked list can span both. Users and form
  submissions are deliberately absent: they are personal data, and a predicate a public query forgets cannot
  leak what the table never held.

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

- [#2151](https://github.com/withplumix/plumix/pull/2151) [`3a1d6e3`](https://github.com/withplumix/plumix/commit/3a1d6e3be497644b17a5c0f5a039b0bcce1f23b4) Thanks [@nasyrov](https://github.com/nasyrov)! - Makes reindexing a resumable scheduled job, so a site can rebuild its search index without a request
  that would never finish.

  Projection runs at roughly 1 300 sources a second, so a large site is minutes of work — well past what
  one invocation can do. A rebuild is now a run: a walk over every searchable entry and term, chunked
  across scheduled invocations, with its position persisted rather than held in memory. An isolate that
  dies mid-chunk loses the chunk, not the run.

  `POST /_plumix/search/reindex` starts one and `GET` reports it, both behind a `search:reindex`
  capability registered at `admin`. Starting is idempotent: a second request while a rebuild is under
  way reports that one rather than beginning a rival walk over the same corpus. There is no cancel,
  because there is nothing to undo — each source is re-projected in place and the index is never
  emptied, so search keeps answering throughout. A run reports how much it has processed, how much it
  could not, and a final status; `succeeded` and `completed_with_errors` are separate answers, since one
  means the rebuild worked and the other means it finished but left something behind.

  The same schedule repairs extractor drift. The extractor version is a hash of every block's text
  declaration, so changing one makes every existing document stale — but the work is now proportional to
  what actually changed. A document whose extracted text is identical is stamped with the new version
  and never reaches FTS5, because the index's update trigger is scoped to the two columns it shadows.
  Only the entries a declaration really moved are re-tokenized. That scoping ships as a second raw
  migration, since one the journal already carries is never emitted again — so run
  `plumix migrate generate` and apply it after upgrading. The runtime repair path recognises the older
  trigger and replaces it as well, so a site that never generates migrations converges anyway.

  A rebuild steps over any entry the change feed still owes: those have been written since the walk
  started, the drain holds the fresher text, and projecting them from the walk's older read could put
  the previous version back. A run that throws is marked `failed` rather than left running, because
  starting is idempotent and a run stuck at `running` would refuse every replacement an operator asked
  for. A batch that fails is retried one source at a time, so a single bad row cannot take two hundred
  healthy ones with it.

- [#2149](https://github.com/withplumix/plumix/pull/2149) [`8fd3eac`](https://github.com/withplumix/plumix/commit/8fd3eac942240170d7bfe8b8a4ecca48fbc7a16d) Thanks [@nasyrov](https://github.com/nasyrov)! - Answers a search for a very common word by recency rather than by relevance, so it returns promptly
  instead of scaling with the corpus.

  FTS5 scores every matching document before applying a limit, so a word in nearly every document costs
  time proportional to the size of the site. It is also the case bm25 has least to say about: a word
  almost everything holds can hardly tell one document from another, so recency is the better answer
  there rather than a degraded one.

  Two questions decide it, and both have to agree before relevance ordering is given up. **Is ranking
  expensive?** Counting how much of the corpus the query matches answers that, bounded by the threshold
  it is compared against. **Is recency actually cheap?** Nothing about the match set answers that — a
  word in a quarter of the corpus is common by any count, and if every one of those entries is old,
  ordering by date still steps over everything newer before it finds a page. So the walk itself is
  measured, capped at the newest few hundred entries: a full page found inside the cap is proof the
  reader will stop there too, and a deep page simply needs more of them.

  Measured at 50 000 entries: a word in every document costs 32.6 ms ranked and 0.6 ms by recency, so
  recency wins; a word confined to the oldest quarter costs 7.6 ms ranked and 761 ms by recency, so it
  keeps its ranking. Reading the match set alone would have chosen recency for both.
  `search({ commonTermThreshold })` moves where ranking is judged expensive.

  Counting the match set rather than reading a word's frequency out of the index's vocabulary is
  deliberate. The vocabulary stores what the tokenizer produced, and a word's term cannot be recovered
  from the word — "theory" is filed under "theori", so the nearest thing a prefix search finds is
  "the", whose frequency belongs to a different word. A wrong number is worse than none. The count is
  also exact where a per-word frequency guesses: a common word paired with a rare one matches only what
  the pair does, and a quoted phrase only where its words are adjacent. Both keep their ranking.

  Ordering by recency needs a different query, not a different `ORDER BY`. Matching makes FTS5 the outer
  loop, so a sort on publication date cannot reach the entries index and every match goes through a
  temporary b-tree. Asking `entries` for its newest rows and testing each against the index inverts
  that; the snippets for the surviving page are then fetched by rowid, bounded to the page.

  `SearchResult.score` widens from `number` to `number | null`, since a page ordered by recency has no
  relevance number to report. A theme doing arithmetic on it needs a null check.

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
