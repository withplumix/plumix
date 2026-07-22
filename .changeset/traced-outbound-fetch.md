---
"@plumix/core": minor
---

Add `ctx.fetch` — traced outbound HTTP. Same signature as global `fetch`; every call produces one telemetry span named `fetch: <METHOD> <host>` with OTel-mappable attributes (`http.request.method`, `url.full`, `http.response.status_code`), nested under the enclosing span. A rejecting fetch marks its span `status: "error"` with the serialized failure before the rejection propagates unchanged.

Core and plugins should make external calls through `ctx.fetch` so slow third-party APIs show up in the request waterfall. Bare global `fetch` remains an untraced, unpatched platform boundary — the same line drawn for DB connections not obtained from `ctx.db`. W3C trace-context propagation (`traceparent` injection) is deferred to the future OTel exporter.
