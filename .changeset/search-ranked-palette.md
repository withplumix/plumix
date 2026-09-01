---
"@plumix/plugin-search": minor
"@plumix/core": minor
"plumix": minor
---

Ranks the admin command palette's Content results out of the search index, so the entry an editor
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
