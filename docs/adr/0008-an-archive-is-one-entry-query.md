# An archive is one entry query

ADR 0007 gave a plugin archive's feed an entry query to narrow, and left the
archive's own page listing hand-written inside `resolve`. The same archive then
described the same set of entries twice, in two vocabularies, with nothing
holding them together. Core's built-in archives had the same split, and it had
already drifted: the front page, author and date listings leave hierarchical
types out while their feeds syndicate them, a term page lists its taxonomy's
types without checking they are public while its feed lists any public entry
attached to the term, and the listing guard requires `publishedAt` while the
feed guard does not.

So an **archive** is described by one entry query, and everything that shows
the archive reads it. An archive declares
`entries: (q, params) => EntryQuery | null` beside its routes. Core runs that query to produce the page **listing**
— paged, resolved, handed to the theme as `entries` and `pagination` the way
the built-in archives already hand them — and a feed is the same query, newest
first and capped. Core's built-in archives (front page, entry type, term,
author, date) each define their query in one place and list through the same
reader. Their routes stay where the permalink configuration compiles them;
what they share with a plugin archive is the query, not the registration.
Core answers which archive owns a URL and what its query is, and the feeds
plugin builds its routes and its items from that answer rather than from a
list of archive kinds of its own — the list that had already put a type's feed
at `/<type name>/feed` while its page sat at its `hasArchive` slug.

Every archive's query is born holding only **public entries** — published,
with a publish date, of a public type — whoever is viewing. An editor previews
in the editor; an archive page is the same for every visitor, which is what
lets the CDN store it. The front page, author and date archives narrow further
to non-hierarchical types, so a standalone page leaves their feeds too.

`entries` is synchronous and records intent, as ADR 0007's `scope` did: a page
render asks it whether the page has a feed to advertise, and must not pay a
query for the answer. `resolve` is left with what only it can do — load a
subject, name the page — and is optional where a `title` is enough.

## Ordering and paging

A query gains ordering — `latest()` by default, `oldest()`,
`orderBy(column, direction)`, `orderByMeta(key, direction)`, the entry id always breaking ties.
Ordering selects no rows, so it keeps 0007's guarantee that nothing a query is
handed can be widened. A feed ignores it and stays newest first, because that is
what a subscriber's reader assumes.

Page size is not on the query. `perPage` is an archive option: a size on the
query would be a method a feed has to ignore that changes _how many_ entries
it shows, not just their order, and page size belongs to the page. Core derives
each archive route's `/page/:page` form and 404s past the last page, as it does
for its own archives, and derives the archive's CDN tags from the types its
query can list.

## Considered options

- **`resolve` returns the query** (rejected). The shape closest to a controller
  returning a query builder, but `resolve` is asynchronous and loads the
  archive's subject, so a feed could not learn the set without rendering the
  page — and would be handed a second declaration again.
- **Keep `scope` as a feed-only narrowing over `entries`** (rejected). It makes
  a page and feed that disagree a thing an archive can opt into, which is the
  failure this record exists to close. A feed that needs a different set is a
  different archive.
- **Plugin archives only** (rejected). Leaves core's own archives describing
  their sets twice, which is where the drift was found.
- **List with the viewer's visibility** (rejected). An editor would see drafts
  on an archive page, the page would vary per viewer, and the page and feed
  would disagree per user instead of per archive.

## Consequences

- `ArchiveTypeFeed.scope` is gone; an archive opts into a feed with
  `feed: true`, and the types refuse a feed on an archive with no `entries`.
- An archive not built on an entry query — search, core's and the search
  plugin's, whose results are a match rather than a set — omits `entries`,
  keeps its own listing, and cannot have a feed.
- A theme's pagination and entry components work unchanged on a plugin archive.
- A plugin can narrow any archive, built-in or not, through a filter that is
  handed its query; since a query only narrows, the filter can hide entries but
  never reveal one, and the page and feed change together.
- Supersedes ADR 0007's closing consequence that the query grows no paging
  methods: it grows ordering, and paging stays off it.
