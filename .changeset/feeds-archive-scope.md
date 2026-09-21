---
"@plumix/plugin-feeds": minor
---

Replaces an archive feed's `filter` with `scope`, which narrows an entry query instead of returning raw SQL. The query arrives restricted to published entries of public types and cannot be widened, so an archive whose feed omitted a status check no longer publishes drafts or trashed entries. An archive declaring an `access` policy now gets no feed, because a feed is a public route core answers ahead of the access gate. Update `feed: { filter: (ctx, params) => sql }` to `feed: { scope: (q, params) => q… }`.
