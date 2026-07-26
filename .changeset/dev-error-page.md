---
"@plumix/blocks": minor
"@plumix/core": minor
---

Add a dev-only error page for render throws in `plumix dev`.

When a theme template throws during render in development, the visitor now gets
a self-contained, theme-independent 500 page showing the exception name,
message, and raw stack — instead of re-rendering the failure through the theme
(which blanks the screen when the theme itself is the culprit). The page is a
shared, zero-JS renderer exposed at `@plumix/blocks/dev-error` and SSR'd by core
at the dispatcher catch. It is gated on `process.env.PLUMIX_DEV`, so the page
and its styles tree-shake out of production builds — the existing themed 500 is
unchanged.
