---
"@plumix/blocks": minor
"@plumix/core": minor
---

Make a throwing block loader dev-fatal in `plumix dev`, naming the block.

When a block's SSR loader rejects during development, the page now fails to the
dev error page — naming the culprit block and surfacing the loader's own
message and the failing query — instead of silently dropping that block from
the render. In production the same rejection stays isolated to the block
(degrading to its `errorFallback`, or nothing) and the page still renders, so
the resilience contract is unchanged.

The render path captures the first loader rejection and, behind the
`process.env.PLUMIX_DEV` gate, throws a new `BlockLoaderError` (exported from
`@plumix/blocks`) that propagates to the dispatcher catch. The wrapper names the
block and loader key, carries the underlying message so error-page hints keep
matching through the loader boundary, preserves the original via `cause`, and
adopts its stack so frames resolve to the failure site. The gate tree-shakes the
escalation out of production builds.
