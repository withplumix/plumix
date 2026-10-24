---
"plumix": minor
---

Adds a `logsEndpoint` option to `otelConsumer`. When set to an OTLP/HTTP logs URL, each span log is exported as an OTLP log record carrying the trace id and span id of the span it was written in, so your tracing backend shows the log next to that span. Logs dropped past the per-request cap show as `plumix.dropped_logs` on the root span. Without `logsEndpoint`, trace export is unchanged.
