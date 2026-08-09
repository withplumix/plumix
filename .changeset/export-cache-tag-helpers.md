---
"@plumix/core": minor
"plumix": minor
---

Export the edge-cache tag helpers from the public entrypoint.

`typeTag`, `entryTag`, `entryPurgeTags`, `termPurgeTags`, and
`enqueuePurgeTags` are now re-exported from `@plumix/core`. A plugin that
bulk-writes directly to `ctx.db` bypasses the `entry:*`/`term:*` lifecycle
actions core's purge invalidator subscribes to, so no edge-cache purge is
enqueued for those writes. It can now enqueue the same coarse `t:<type>` /
`e:<id>` tags core would — `enqueuePurgeTags(ctx, entryPurgeTags(type, id))` —
which the post-request/scheduled flush picks up, instead of hand-restating the
tag scheme (PRD #1080) and drifting when it changes.
