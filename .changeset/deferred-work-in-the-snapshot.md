---
"plumix": minor
---

Delivers the telemetry snapshot once the request's or scheduled run's deferred work has settled, or after 10 seconds, instead of at the response. Each `ctx.defer` call becomes a `defer` span under the span that called it, and a rejection is recorded as that span's error. A span still running when the snapshot is taken now has the new status `unfinished`, which `otelConsumer` exports with its status unset and a `plumix.unfinished` attribute. `error_list` also lists errors from deferred work. A self-hosted `dispose()` delivers the snapshots still waiting when its drain deadline comes.
