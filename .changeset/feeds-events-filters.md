---
"@plumix/plugin-feeds": minor
---

Adds `feed`, exported from `@plumix/plugin-feeds`, holding the plugin's async filter `items`, so another plugin adds, drops or re-orders a feed's items with `ctx.filters.add(feed.items, (items, { archive, params }) => …)` with no `declare module`.

Breaking: the `feed:items` string name is removed from `FilterRegistry`. Replace `addFilter("feed:items", (items, scope) => …)` with `ctx.filters.add(feed.items, (items, scope, ctx) => …)`; the handler now also receives the request's `ctx`. Spies in tests take the value: `spyFilter(feed.items)`.
