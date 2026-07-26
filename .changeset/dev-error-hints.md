---
"@plumix/blocks": minor
"@plumix/core": minor
---

Show actionable "how to fix" hints on the `plumix dev` error page.

When a recognized error reaches the dev error page, it now surfaces a prominent
"how to fix" card above the stack. Core matches its own typed errors (e.g.
`ThemeRegistrationError`) and a curated set of common untyped pitfalls — a D1
`no such table` points at `plumix migrate`, a missing secret points at
`.dev.vars`, a missing binding points at `wrangler.jsonc`. Unrecognized errors
render no card.

Hints are contributed through a new dev-only `error_page:hints` filter that
mirrors `debug_bar:panels`: it runs on every dev 5xx with the caught error and
request context, and plugins subscribe to add or override hints. The shared
renderer at `@plumix/blocks/dev-error` gains the `DevErrorHint` shape and renders
the cards. Everything stays gated on `process.env.PLUMIX_DEV` and tree-shakes out
of production.
