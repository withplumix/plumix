---
"@plumix/plugin-search": minor
---

Answers a search for a very common word by recency rather than by relevance, so it returns promptly
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
