# @plumix/plugin-search

This Plumix plugin keeps a **full-text index** of everything a site publishes, so a visitor can find a word from the middle of an article rather than only from its title.

It replaces the search page core ships with one that reads that index: results ranked by relevance, each carrying a snippet with the matching phrase highlighted.

## Install

```bash
pnpm add @plumix/plugin-search
```

Then add it to your `plumix.config.ts`:

```ts
import { plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { search } from "@plumix/plugin-search";

export default plumix({
  // …your runtime, database, and auth
  plugins: [blog(), search()],
});
```

The plugin owns a table and DDL that drizzle cannot express, so generate and apply migrations once after installing:

```bash
plumix migrate generate
```

## The search page

The plugin claims `/search/<query>` and its paginated variant, at a priority that sorts ahead of core's own rules. Core's rules stay compiled behind them, so uninstalling the plugin restores the built-in page with nothing to undo.

Bare `/search` stays core's. A plain HTML form submits `GET /search?q=…` and core answers it with a redirect to the canonical `/search/<q>`, which lands back here — so search works with JavaScript disabled. One consequence is worth knowing: a theme that renders both the empty search page and the results page needs two templates, `search` for core's and `forArchiveType("search")` for this one.

```tsx
forArchiveType("search").template(({ data }) => (
  <ol>
    {data.results.map((result) => (
      // An entry and a term can share an id, so the kind is part of the key.
      <li key={`${result.kind}:${result.id}`}>
        <a href={result.url}>{result.title}</a>
        <p dangerouslySetInnerHTML={{ __html: result.snippet }} />
      </li>
    ))}
  </ol>
));
```

A result carries `kind`, `id` (unique only within that kind — an entry and a term can share one), `title`, `url`, `snippet` and `score`, and the payload carries `nextUrl` — where the next page of results lives, or `null` at the end. It is opaque on purpose: a theme renders it and never builds it, so what paginating means can change without the payload changing shape. Asking for a page past the end is a 404, as it is on core's own search page. The snippet is **already escaped** — FTS5 splices its highlight markers into indexed content without escaping anything around them, so it arrives with everything but `<mark>` turned into entities. That makes it safe as element content, which is where a snippet goes. It is not safe in an attribute: quotes pass through.

Only published entries appear. Drafts, scheduled and trashed entries are in the index so an author can find their own work in the admin, and the page's query clamps them out.

**An entry type under an access policy is never indexed at all.** A snippet is body text around a word the visitor chose, so indexing a members-only type would hand an anonymous reader its prose a query at a time. Keeping it out of the projection is what makes that impossible rather than dependent on a predicate; the cost is that a gated type is ranked nowhere, and in the admin palette falls back to core's title-and-excerpt match.

The search page is not edge-cached, for the reason core gives for leaving its own out: the query space is unbounded, so every distinct string a crawler tried would mint a cache entry.

A query is whatever a visitor typed, treated as words to look for: adding a word narrows the results, a quoted phrase matches exactly, `-word` rules a word out, and FTS5's own operators are inert. Any string compiles to a valid search, so an unbalanced quote returns nothing rather than an error page. A query of nothing but exclusions returns nothing: FTS5 cannot spell "every document except these", and the whole corpus is not what someone typing `-draft` meant.

### Topics are results too

A visitor searching a topic's name reaches the topic, not only the articles about it. Terms are indexed beside entries in the same index and come back in the same ranked list — not two queries merged, which would be putting bm25 scores side by side that were computed against different corpora.

```tsx
forArchiveType("search").template(({ data }) => (
  <ol>
    {data.results.map((result) => (
      <li key={`${result.kind}:${result.id}`}>
        {result.kind === "term" ? (
          <Topic {...result} />
        ) : (
          <Article {...result} />
        )}
      </li>
    ))}
  </ol>
));
```

A term contributes its name and the description its archive carries. Which taxonomies take part follows the same rule entry types follow:

```ts
ctx.registerTermTaxonomy("internal", {
  label: "Internal",
  excludeFromSearch: true,
});
```

A taxonomy that is not public is excluded already, so a navigation-menu taxonomy stays out of results without a second declaration. The admin command palette is unaffected — an editor searches what they can read, not what a visitor can.

Two things are worth knowing. A term is indexed when it is created, renamed or deleted through the application, and a term the projection has never held is picked up by the scheduled run — core's change feed records entries only, so that sweep is what reaches the categories a site already had. A term written straight to the database after that waits for the same sweep rather than appearing at once. And the recency plan below is entries-only, because a term has no publication date to be ordered by, so a word common enough to reach that plan is answered with articles.

## The admin command palette

The palette's Content results are ranked out of the same index, so the entry an editor wants is near the top rather than merely the one edited most recently — and a word from the middle of an entry's body finds it, which a palette matching titles and excerpts could not do.

Nothing is configured. Core's own handler stays registered underneath, and handlers sharing a group fill it between them: the ranked matches lead, and core's title-and-excerpt matches fill whatever is left. That is the whole of the degrading story — no switch, no health check. Whatever the index cannot answer, core still does: a type under an access policy, which is never indexed; an entry not yet projected, on a site that has installed the plugin but not rebuilt; every type at all before the index exists; and a half-typed word, since the index matches whole terms and an editor mid-word has not typed one yet. The cost is that both queries run on every keystroke, which is what buys the seamlessness.

Who may see what is core's decision, not the plugin's: both handlers build their query on the same clause, so an author sees their own drafts here and nobody else's, and a trashed entry appears in neither. The ranked half asks for one thing more — the caller must be able to **edit** the type, not merely read it. A ranked result is a body-text match, so answering one says a word appears somewhere inside an entry, and `entry:<type>:read` bottoms out at the subscriber tier: on a site with open signup every reader holds it for every registered type. Core's title match still answers those types.

`-word` excludes here too, the same as it does in the entries list.

## Ranking

```ts
search({ ranking: "bm25-v1" });
```

Weighted bm25, with a title match counting for ten times a body match. The weights are hardcoded, but the algorithm is **named** — a site that has named the one it is on keeps its result order when a better algorithm ships. That is the whole reason the option exists; there is no weighting dashboard, and tuning weights without a real corpus is guesswork.

### A very common word is answered by recency instead

FTS5 scores every matching document before applying a limit, so a word in nearly every document costs time proportional to the corpus. It is also the case where bm25 has the least to say: a word almost everything holds can hardly tell one document from another. Recency is the better answer there, not a degraded one.

So the plugin asks two questions before it gives up relevance ordering, cheapest first.

**Is ranking expensive?** It counts how much of the corpus the query matches, stopping as soon as the count passes the threshold. **Is recency actually cheap?** Nothing about the match set answers that — a word in a quarter of the corpus is common by any count, and if every one of those entries is old, ordering by date still steps over everything newer before it finds a page. So the walk itself is measured, capped at the newest few hundred entries: a full page found inside the cap is proof the reader will stop there too. A deep page simply needs more of them, and stops qualifying.

Measured at 50 000 entries:

|                       | word in every document | word in 1/50 | word only in the oldest quarter |
| --------------------- | ---------------------- | ------------ | ------------------------------- |
| ranked by relevance   | 32.6 ms                | 0.2 ms       | 7.6 ms                          |
| ordered by recency    | 0.6 ms                 | —            | 761 ms                          |
| what the plugin picks | recency                | ranked       | ranked                          |

The last column is why the walk is measured rather than inferred. A result ordered by recency carries `score: null`, since there is no meaningful relevance number to report.

```ts
search({ commonTermThreshold: 12_000 });
```

Counting the match set rather than looking a word up in the index's vocabulary is deliberate. The vocabulary stores what the tokenizer produced — porter files "running" under "run" — and a word's term cannot be recovered from the word: "theory" is filed under "theori", so the nearest thing a prefix search finds is "the", whose frequency belongs to a different word entirely. A wrong number is worse than none.

The count is also exact where a per-word frequency is a guess. A query is an implicit AND, so a common word paired with a rare one matches only what the pair does, and a quoted phrase matches only where its words are adjacent. Both measure as the selective queries they are and keep their ranking.

## How it stays current

```
entries ──[trigger: enqueue on a real change]──▶ entry change feed
change feed ──[extract prose]──▶ search_documents
search_documents ──[trigger]──▶ FTS5 index
```

Both boundaries where the index could drift from the content are closed **in the database**, so a seed, a migration, a bulk import or a direct write cannot bypass them. Only the middle hop runs in JavaScript, because stripping HTML out of block content needs a language SQLite does not have.

Saving an entry through the editor indexes it after the response is sent, so nobody waits for it. Anything that path misses — a row written straight to the database, an isolate that died mid-request — is caught the next time the feed is drained on the site's scheduled trigger. The drain is bounded per invocation, so a backlog spreads over several rather than running one past the platform's limits.

The FTS5 index and its triggers are DDL that drizzle cannot express, so they ship as a raw SQL migration — and the drain re-creates them if they are missing, which turns a migration that never ran into a delay rather than an outage.

### A missing index degrades the page, it does not break it

A migration that was never applied, a restored dump, an install before its first scheduled run: the index can genuinely be absent, and a visitor should not meet that as an error page. A search that finds no index to read answers from core's own vocabulary instead — each word of the query matched as a substring of the entry's title or excerpt — and creates the index behind the response, so the search after it is a real one again.

What is worse in the meantime is worth knowing: a word only the body holds is not found, no snippet is highlighted, results carry no score, and topics are missing entirely, since core's page has never returned them. Repairing is idempotent, so two requests arriving on the same missing index converge on one index rather than racing — D1 has no migration lock, and neither does this. They converge on the outcome, not on the work: each one rebuilds, so a burst of searches into a missing index is a burst of rebuilds.

A save that leaves the text where it was writes nothing: the change feed's own guard ignores it, and the projection's upsert is a no-op when the extracted text has not moved. Bulk status changes stay cheap. A meta write is on the feed whether or not the site has a searchable field — the feed's triggers are core's, and cannot ask what this plugin's roster says today — but a bag nothing is projected from produces the same text as before, so it stops at the projection.

## What is indexed

Every entry of a type that is searchable — which is every public type, with no extra declaration. A type opts out with one field:

```ts
ctx.registerEntryType("ledger", { label: "Ledger", excludeFromSearch: true });
```

A non-public type (`isPublic: false`) is excluded already, so internal types need no second switch.

**The exclusion bounds a visitor, not an editor.** An excluded type is still projected and still ranked in the admin command palette, and the search page's own query is what keeps it out of a visitor's results — so a navigation-menu entry stays findable where an editor has to find it. The one type that is kept out of the projection altogether is a type under an access policy, above.

Each entry contributes its title, its excerpt, the text its blocks declare — including table cells, button labels, list items, image alt text and code listings — and whatever meta fields opted in below. A block says which of its inputs carry text; a block that declares nothing contributes nothing. The declaration is data, so an extractor version can be derived by hashing the roster rather than maintained by hand, and every document is stamped with the version that produced it — which is what lets a declaration change repair itself, below.

### Meta, when a field asks for it

Structured data in an entry's meta bag is invisible to search until a field says otherwise:

```ts
ctx.registerEntryMetaBox("extras", {
  label: "Extras",
  entryTypes: ["post"],
  fields: [
    text("subtitle").searchable(),
    text("internalRef"), // bookkeeping — stays out
  ],
});
```

Default-deny, the way `.showInApi()` is. Meta holds plugin bookkeeping and internal keys at least as often as it holds prose, and indexing all of it is the mistake ElasticPress spent a decade on before reversing it in 5.0 — the same failure this plugin already avoids for entry content.

`.searchable()` is honored on the text-shaped inputs — `text`, `textarea`, `email`, `url`, and `richtext`, whose stored document is flattened to its prose. The chain compiles on a `password` field and on a repeater row or group member, and is ignored on all three: nothing else carries text a visitor would search for. A field's `.default()` is not indexed either, since the default is not in the bag — it would put the same string in every document.

**A capability-gated field is never indexed, whatever it declared.** A snippet is body text around a word the visitor chose, so a value only some editors may read cannot be in the document at all — the same reasoning that keeps an access-gated entry type out. A `password` field is excluded for the same reason. Both are silent: the declaration is honored where it can be, and dropped where honoring it would leak.

Marking an existing field searchable needs nothing else. The extractor version hashes the field roster beside the block roster, so every affected document is stale from that moment and the scheduled run re-projects them — no version to bump, no entry to re-save. Term meta is not indexed: a taxonomy has no such declaration.

**Taking a field back out converges rather than taking effect at once.** Un-marking one, or putting a capability on it, is the same stale-document sweep read backwards — the text is already baked into the index rows, and unlike an entry type there is nothing a query-time clamp could filter on. A large corpus takes many scheduled runs to finish retracting; [start a rebuild](#rebuilding-the-index) to force it. That asymmetry is worth knowing before a field that turned out to be sensitive is the one being retracted.

Users and form submissions are never indexed. They are personal data, and a predicate a public query forgets cannot leak what the table never held.

Status is not filtered here. Drafts and trashed entries are in the projection so an author can find their own unpublished work in the admin; keeping them out of public results is the query surface's job.

## Rebuilding the index

A full rebuild is far too much work for one invocation — projection runs at roughly 1 300 sources a second, so a large site is minutes of it. So a rebuild is a **run**: a walk over every searchable entry and term, chunked across scheduled invocations, with its position stored as a row rather than held in memory. An isolate that dies mid-chunk loses the chunk, not the run.

```bash
curl -X POST https://example.com/_plumix/search/reindex   # start, or report the one already going
curl https://example.com/_plumix/search/reindex           # how the last one went
```

Both need the `search:reindex` capability, which is registered at `admin`. Starting is idempotent: a second request while a rebuild is under way reports that one rather than beginning a rival walk. There is no cancel, because there is nothing to undo — each source is re-projected in place and the index is never emptied, so **search keeps answering throughout** and a stopped run is indistinguishable from one that has not reached the rest of the corpus yet.

A run reports `processed`, `failed` and a final status. `succeeded` and `completed_with_errors` are separate answers on purpose: the second walked the whole corpus and could not project some of it, which is a different thing to be told than that the rebuild stopped.

A rebuild steps over any entry the change feed still owes. Those have been written since the walk started and the drain holds the fresher text, so letting the rebuild project them could put the older version back.

### Declarations repair themselves

The extractor version is a hash of every block's text declaration and every searchable meta field, so changing one makes every existing document stale. The scheduled run re-extracts them a bounded slice at a time, and the work is proportional to what actually changed rather than to the corpus: a document whose extracted text is identical is stamped with the new version and never reaches FTS5, because the index's update trigger is scoped to the two columns it shadows. Only the entries a declaration really moved are re-tokenized.

That scoping arrives as a migration, and so does `meta` joining the change feed's watched columns, so **run `plumix migrate generate` and apply it after upgrading**. Until you do, a roster change re-tokenizes the whole corpus — correct, just far more work than it needs to be — and a meta-only save reaches the index on the next rebuild, or on the next save that also moves the entry's text, rather than at once. The runtime repair path recognises the older index trigger and replaces it too, so a site that never generates migrations converges on the next scheduled run; the change feed's triggers are core's, and only a migration moves those.

One thing a rebuild does not do: remove a document whose source is gone or has stopped being searchable. Those are dropped when the source is next written, and the read path filters them out meanwhile, so they cost storage rather than correctness.

## Storage

Search roughly doubles the size of the database. On Cloudflare D1, whose per-database limit is 10 GB, that puts the ceiling around 480 000 entries with search enabled and nothing else in the database. Beyond that is a second database, not a tuning problem.
