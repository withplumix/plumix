---
"@plumix/plugin-comments": minor
---

Adds `comment`, exported from `@plumix/plugin-comments`, holding the plugin's events `created`, `approved`, `spam`, `trashed` and `deleted` and its async filter `moderate`, so another plugin subscribes with `ctx.events.on(comment.approved, …)` or `ctx.filters.add(comment.moderate, …)` with no `declare module`. Event handlers receive `{ comment }` and the request's `ctx` second. Moderation still purges the entry's cached page as before.

Breaking: the `comment:*` string names are removed from `FilterRegistry` and `ActionRegistry`. Replace `addAction("comment:approved", (comment, ctx) => …)` with `ctx.events.on(comment.approved, ({ comment }, ctx) => …)`, and `addFilter("comment:moderate", (status, candidate) => …)` with `ctx.filters.add(comment.moderate, (status, candidate) => …)`. Spies in tests take the value: `spyEvent(comment.created)`, `spyFilter(comment.moderate)`.
