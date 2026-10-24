---
"plumix": minor
---

Adds span logs: while a request or scheduled run is sampled, every `ctx.logger` call is also kept on the span current at the call, at every level, as `logs: { at, level, message, attributes }[]` on that span. They show under their span in the debug bar's timeline, in request history and in `telemetry_request_get`; a request keeps up to 1000 and counts the rest in the snapshot's new `dropped.logs`. Every log line now carries `requestId` in its meta, so a production log line can be matched to its request; a `requestId` you pass yourself is kept.
