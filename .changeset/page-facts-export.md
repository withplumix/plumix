---
"@plumix/core": minor
---

Adds `pageFacts`, which normalizes a render payload into what the page _is_ — its kind, 1-based
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
