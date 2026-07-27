---
"@plumix/core": minor
---

Add a dev-only request history to the debug bar so a developer can inspect
requests that already finished — including RPC/REST/`/api` and 5xx responses
that never get an inline bar.

Every request the worker handles is captured, after the response, into a
bounded in-memory ring as a serializable `DebugSnapshot` (span tree, telemetry
records, and a small fixed projection of request context). Snapshots are
detached to inert JSON at capture, so holding recent requests never pins the
request graph, and oversized payloads are truncated to keep the footprint flat.

The bar's panels now render purely from a `DebugSnapshot`, so a stored request
replays identically to a live one and plugin panels support history for free.
Dev-only read routes expose the history over HTTP — `GET
/_plumix/debug/requests` (newest-first metadata), `/<id>` (the snapshot JSON, a
future MCP tool's canonical source), and `/<id>?format=html` (the same snapshot
rendered to panel markup) — with the endpoint excluded from its own capture.

The bar gains a request switcher: a `<select>` of the recent requests
(method/path/status/duration, newest-first) with the current request
pre-selected. The current request is still server-rendered inline on page load
(no flash, zero-JS); selecting a past one is the bar's single client-JS
concession — a minimal listen → fetch → swap that fails soft, so a history
hiccup never breaks the host page. The whole subsystem — capture, store, routes,
switcher, and script — is gated on the dev flag and tree-shaken from production
builds.
