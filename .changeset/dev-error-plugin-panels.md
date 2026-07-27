---
"@plumix/blocks": minor
"@plumix/core": minor
---

Let plugins contribute panels to the `plumix dev` error page.

The dev error page already shows fixed request / route / database / timeline /
application context below the stack. A plugin can now add its own section
through a new dev-only `error_page:panels` filter, mirroring how it contributes
to the debug bar via `debug_bar:panels`:

```ts
"error_page:panels": (
  panels: readonly DevErrorPanel[],
  error: unknown,
  ctx: AppContext,
) => readonly DevErrorPanel[];
```

Each `DevErrorPanel` is `{ id, title, order?, render }`, where `render(error,
ctx)` returns a `ReactNode` over the caught value and the live request context —
the same pair the `error_page:hints` filter receives. Core collects the filter
`applyFilterIsolated`-safe, dedupes by id (last wins), orders by ascending
`order`, and renders each panel in its own isolated SSR pass, so a throwing
subscriber or a panel that throws from `render` degrades to a notice rather than
crashing the very page meant to surface the error. Contributed panels appear as
their own sections below the built-in context.

Core registers none of its own — its built-in sections cover the common case —
so this filter is purely the plugin-facing panel API. The whole surface stays
behind the `PLUMIX_DEV` gate and tree-shakes out of production builds.
