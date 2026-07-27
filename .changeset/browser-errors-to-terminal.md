---
"@plumix/blocks": minor
"plumix": minor
---

Forward browser/island errors to the dev terminal.

In `plumix dev`, client failures now also surface where the developer is already
working. A dev-only catch net mirrors the island error overlay's producers —
uncaught exceptions, unhandled rejections, and the island renderer's
`plumix:island-error` / `plumix:hydration-error` events — and additionally
patches `console.error` and `console.warn` (never `console.log`). Each entry is
batched and POSTed to a new Vite dev-server endpoint, which sourcemaps the stack
through the dev server's per-module sourcemaps and prints it tagged `[browser]`
with a project-relative `file:line`, application frames shown and framework
frames collapsed to a count. Consecutive identical entries collapse into a
running `(×N)` count.

On by default and tuned by `PLUMIX_FORWARD_ERRORS` (`off` disables, `error`
drops warnings, the default forwards both). Everything is gated on
`process.env.PLUMIX_DEV` and tree-shakes out of production island bundles.
Vite 8's native `forwardConsole` is disabled by the plugin so client output
isn't printed twice; a consumer can re-enable it in their own `vite` config.
