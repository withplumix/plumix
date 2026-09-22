# An extension point hands out a query, not a filter

A plugin archive's feed used to be declared as a SQL row predicate:
`feed: { filter: (ctx, params) => SQL | null }`, which `@plumix/plugin-feeds` used
as the whole `WHERE`. Every built-in feed scope joined `published` and a
public-entry-type check onto its own predicate; the plugin branch joined nothing.
An archive whose filter forgot `eq(entries.status, "published")` syndicated
drafts and trashed entries to anonymous readers, and each of the six filters in
the repo was that one condition and nothing else — the extension point's only
observed use was restating the rule it should never have been asked about.

Correctness by remembering does not hold, so the shape is inverted. Core owns an
**entry query** (`entryQuery()` on `plumix/db`): a description of a set of
entries built by narrowing. Feeds hands an archive one already restricted to
published entries of public types, every method on it adds a condition, and none
removes one. An archive that says too little gets a feed of fewer entries than it
meant. Short of interpolating a raw SQL fragment that closes the parentheses
around it — which is SQL injection in the plugin, not a use of the query —
there is no way to say too much.

That property is only worth as much as its weakest edge, and it has three.
**Parentheses**: drizzle's `and` wraps the conjunction but not its operands, so a
contributed condition containing a top-level `OR` would bind looser than the
`AND`s around it and select every row — each condition is parenthesized before it
is joined. **Reachability**: what a query has recorded is held in a module-level
`WeakMap` rather than on the query, because a readable member is a writable one
after one assertion and `{ ...given, narrowings: [] }` would otherwise satisfy
the type; a query nobody built cannot be compiled. **Re-application**: feeds ANDs
the guard on again when it compiles, so even a scope that discards what it was
handed and builds a query from scratch is still narrowed.

A scope records intent rather than resolving it. Feeds asks it on every archive
page render, to decide whether the head advertises a feed, so a scope that
resolved a term by path would have cost a query per page view. Resolution
happens once, when a feed is actually served. The price is that the head cannot
see a narrowing that fails only on resolution — a term slug nothing answers to —
and advertises a feed that 404s. An archive whose `resolve` already 404s the
params it cannot place never renders that page, which is the common case.

`@plumix/plugin-seo` asks an archive for the opposite thing: `ArchiveTypeSitemap`
takes finished URLs, not a query. The asymmetry is the point rather than an
inconsistency. A sitemap is any URL space, so seo cannot own the query behind it;
a feed is always entries, so feeds can, and what a surface can own it should.

## Considered options

- **AND the guard onto the existing `SQL` filter** (rejected). Two lines, closes
  the leak, and leaves the plugin importing drizzle and `plumix/schema` so that
  feeds' internal query shape stays its extension interface — along with the
  per-page-render query cost. The next ticket in this area reopens the same file.
- **A closed `{ entryTypes, termIds, authorId, dateRange }` object** (rejected).
  Safe and simple, but a fixed set: a parent subtree (`/docs/:path+`) and a meta
  match are not expressible, and `termIds` makes the plugin resolve a term itself
  — the lookup the declarative shape was meant to take off it.
- **Ask for finished items, as seo does for URLs** (rejected). Symmetric with the
  sitemap, and it hands the plugin back the whole visibility question the ticket
  exists to take away from it.

## Consequences

- `plumix/db` carries one read-side export among the direct-write toolkit. It
  belongs there rather than on `plumix/plugin`: `where(sql)` needs the `sql`
  template, and a value has one import path.
- `ArchiveTypeFeed.filter` is gone rather than deprecated. Pre-1.0, and the
  surface had no consumer outside this repo's own tests.
- An archive declaring an `access` policy gets no feed until a public route can
  carry a policy (#2520). A feed is a registered public route, which core answers
  ahead of the access gate, so the alternative on offer was an ungated feed.
- The query grows no paging methods here. An archive listing its own page from
  the same query (#2521) needs order, limit and offset, which a feed fixes for
  itself; adding them later is additive. Superseded by ADR 0008, which adds
  ordering to the query and keeps paging on the archive.
