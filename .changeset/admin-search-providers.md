---
"plumix": minor
---

Adds `ctx.registerSearchProvider({ id, order, search })` for answering the admin command palette, and removes the `admin:search:results` filter. Core's own answers are one provider, id `core`; a provider with `order: "early"` answers ahead of it and leads its groups, while one without an order fills after it. A provider that throws is logged through the site's logger and the others still answer, and a duplicate provider id fails boot. Move an `addFilter("admin:search:results", fn, { priority })` call to `registerSearchProvider({ id, order: "early", search: fn })` when it should lead core, or drop `order` when it should follow.
