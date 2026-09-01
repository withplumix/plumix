---
"@plumix/plugin-search": minor
"@plumix/plugin-seo": patch
"@plumix/core": minor
"plumix": minor
---

Lets a plugin-registered archive state which page of results it is, and which query it answers.

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
