---
"@plumix/plugin-search": minor
"@plumix/core": minor
"plumix": minor
---

Indexes terms beside entries, so a visitor searching a topic's name reaches the topic rather than
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
