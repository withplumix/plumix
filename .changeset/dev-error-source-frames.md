---
"@plumix/blocks": minor
"@plumix/core": minor
"plumix": minor
---

Resolve dev error-page stack frames to original source with a code excerpt.

The `plumix dev` error page now parses the (already-sourcemapped) stack into
frames showing each original `file:line`, with application frames expanded and
framework/vendor frames collapsed behind a toggle. Selecting a frame shows a
source excerpt with the offending line highlighted — lazy-fetched from a new
dev-only source resolver mounted as a Vite middleware, so the worker (which has
no filesystem) never reads source itself. Paths are shown relative to the
project root the frames imply. Everything stays gated on `process.env.PLUMIX_DEV`
and tree-shakes out of production.
