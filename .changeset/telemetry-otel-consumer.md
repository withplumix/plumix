---
"@plumix/core": minor
---

New `@plumix/core/telemetry-otel` subpath: `otelConsumer(...)` is an OTel trace exporter as a telemetry consumer. One entry in `telemetry.consumers` ships each collected request's span waterfall to any OTLP/HTTP backend (Grafana Cloud Tempo, a local otel-collector, …) as an `ExportTraceServiceRequest` — root `SERVER` span from the request envelope with HTTP semconv attributes, the collected span tree as `INTERNAL` children (ids minted at export time), records as root-span events, errors as `STATUS_ERROR` plus `exception` events, and cap-dropped counts surfaced. Supports head sampling (`sample` ratio), tail sampling (`tailSample` on the finished snapshot), and joining a caller's trace via an inbound W3C `traceparent`. Exports run per request from `waitUntil`; failures are logged, never surfaced to the request path. Zero dependencies — the OTLP/JSON payload is hand-rolled to stay Workers-lean.
