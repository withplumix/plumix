---
"plumix": minor
"@plumix/plugin-og": patch
"@plumix/runtime-cloudflare": patch
---

Adds `ctx.registerDebugPanel`, `ctx.registerErrorPanel` and `ctx.registerErrorHint`, and removes the `debug:panels`, `error_page:panels` and `error_page:hints` filters they replace.

- An error panel shows only for the errors its `visible(error)` accepts, and every error when `visible` is unset. A hint takes a `matches(error)` and shows after core's hints.
- An id that core or another plugin already registered fails boot. Before, the last panel with an id won.
- A `render`, `visible` or `matches` that throws hides only its own item and is logged through the site's logger. Before, a panel that failed to render showed a "failed to render" notice.
- A plugin can no longer remove or reorder another plugin's panels or hints.
- A runtime adapter adds hints for its platform's errors with the new `RuntimeAdapter.errorHints`. They show after core's and before any plugin's.
- The three registrations do nothing outside `plumix dev`.

Breaking: replace `ctx.addFilter("debug:panels", (panels) => [...panels, panel])` with `ctx.registerDebugPanel(panel)`, and do the same for the error page's panels and hints. A hint registration needs an `id` and a `matches(error)`.

The og plugin registers its debug panel this way, and the Cloudflare runtime offers its missing-binding hint through `errorHints`. Both need this release of `plumix`.
