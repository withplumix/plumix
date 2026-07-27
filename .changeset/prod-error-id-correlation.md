---
"@plumix/core": minor
---

Attach a correlation id to production 5xx responses so an operator can tie a
user's report to a specific failure without exposing a stack.

When a request throws at the dispatcher's public-render boundary in production,
the themed `500` now carries the failing request's telemetry id as an
`errorId`. It flows to the theme's error template via `ErrorData.errorId` and is
printed on the built-in `500` page (`Reference ID: …`) when the theme ships no
`500` template of its own. The id is the same value the telemetry envelope and
structured `dispatch_failed` log already record, so quoting it maps straight to
the request's snapshot and span — no new id is minted.

Nothing about the production error path's isolation changes: `ErrorData` still
exposes no `Error` field, and no stack, source, or exception message crosses the
boundary. A `404` leaves `errorId` undefined; the dev error surface is
unaffected.
