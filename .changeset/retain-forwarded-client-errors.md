---
"@plumix/blocks": minor
"plumix": minor
---

Retain forwarded client errors in a dev ring behind a read endpoint.

In `plumix dev`, the browser-errors-to-terminal forwarder now also keeps each
already-sourcemapped client failure — uncaught exceptions, unhandled rejections,
island and hydration errors, and forwarded `console` errors/warnings — in a
bounded ring alongside the existing terminal print. The ring is capacity- and
byte-bounded with per-string truncation, mirroring the server-side request
history store, so a burst of client errors can't pin memory.

A new dev-only GET endpoint returns the retained entries newest-first, each
preserving `source: "client"`, its level, message, resolved stack, and the
island/component label when present. This is the client half of the dev-only MCP
`error_list` surface: the worker-side tool merges these entries with its
server-side projection. Terminal printing is unchanged, and the whole path stays
gated on `process.env.PLUMIX_DEV` and tree-shakes out of production.
