---
"@plumix/plugin-search": minor
"@plumix/core": minor
"plumix": minor
---

Gives the search index a query surface: `/search/<query>` now returns ranked results with highlighted
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
