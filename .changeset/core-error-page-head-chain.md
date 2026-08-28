---
"@plumix/core": minor
"plumix": minor
---

Runs the `render:document` filter chain on error pages, and tells a plugin which entry type an
archive lists.

A 404 or 500 rendered through the theme previously skipped `render:document` entirely, so a plugin
writing head tags reached every page except the ones it most needed to — a page that was not found
had no way to say `noindex`. The chain now runs there with the error payload, which `pageFacts`
already describes as `kind: "error"`.

`applyCanonical` deliberately still does not run on that path: a URL that resolved to nothing must
not declare itself the canonical address of anything. The filter is applied inside a `try` there,
unlike on the happy path — `applyFilter` does not isolate a throwing subscriber, and this render is
already the failure path, so letting one escalate would hide a clean 404 behind a themed 500.

A theme's string `titleTemplate` now substitutes `%s` through a function replacement, so `$&`,
`` $` ``, `$'` and `$$` in a page title are the characters an author typed rather than replacement
patterns. An entry titled `Q&A: $& explained` previously rendered as `Q&A: %s explained`.

`PageFacts` gains `contentType` — the entry type an entry-type archive lists, and null on every
other page kind, including a single entry whose own type is on `entry`. Without it a consumer
reasoning about "this whole type" had to re-derive the subject from the render payload, which is
the projection `pageFacts` exists to prevent.
