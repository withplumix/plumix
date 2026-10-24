# The telemetry snapshot holds a request's logs and deferred work

A request's telemetry snapshot left out two things a developer needs when
something goes wrong (#3336). A `ctx.logger` call printed to the terminal but
was not on the debug bar's timeline, in request history, in the MCP tools or
in the OpenTelemetry trace, and a production log line had nothing linking it
to its request. Work started with `ctx.defer` ran after the snapshot was built
and handed to consumers, so a span it opened might or might not show up, and a
rejection went only to the logger.

Effect (`effect@4.0.6`) answers the same questions by keeping each log as an
event on the fiber's current span, letting forked work keep its parent span,
and exporting each span as it ends. Plumix takes the first two and not the
third.

> **While a request or scheduled run is sampled, every `ctx.logger` call is kept
> on the span current at the call, and every log line carries `requestId`.
> Deferred work belongs to the request's trace. Consumers get one snapshot per
> request, delivered once its deferred work has settled or after a fixed 10s
> deadline. Logs on spans are exported over OTLP as log records, not span
> events.**

## What this means

- **One snapshot, after deferred work.** Tail sampling, request history and
  the MCP tools each need the whole request in one place, so core keeps its
  single per-request snapshot instead of exporting each span as it ends. The
  snapshot is delivered once the deferred work the request started (and the
  work that work defers) has settled.
- **A fixed 10s deadline.** Delivery waits at most 10 seconds, so hung
  deferred work cannot hold telemetry back indefinitely or use up the Workers
  `waitUntil` budget. A span still running at the deadline is marked
  `unfinished`. The deadline is a core constant with no option.
- **Logs live on spans, as `logs`.** Each span carries
  `logs: { at, level, message, attributes }[]`, at every level. `attributes`
  is the call's meta made JSON-safe, an `Error` in a span error's shape. A log
  written with no span current reaches the logger and is kept on no span, and
  an unsampled request keeps none. A request keeps at most 1000, and counts the
  rest in `dropped.logs`.
- **Logs export as OTLP log records.** OpenTelemetry is deprecating its Span
  Events API in favour of log records tied to the active span, so a span log
  is exported as a log record carrying its span's trace and span ids, and
  records keep exporting as events on the root span. The field is named `logs`,
  not `events`, for the same reason, and because "event" already means a hook
  in Plumix.
- **The wrapper is core's, not the logger's.** Core wraps `ctx.logger` the way
  it wraps `ctx.defer`, so span logs and `requestId` work with any logger,
  console, JSON or custom, and core's own log lines are kept too. A caller's
  own `requestId` in the meta wins.

## Considered options

- **Effect's model: export each span as it ends.** Rejected: tail sampling,
  request history and the MCP tools would each have to reassemble a request
  from pieces, and none of them could tell a finished request from one still
  running.
- **Logs as span events.** Rejected: the OpenTelemetry API for them is being
  deprecated, and backends join log records to spans by their ids.
- **Wait for deferred work without a deadline, or make the deadline an
  option.** Rejected: one hung task would hold that request's telemetry, and
  the Workers `waitUntil` budget, without end; no site has asked to tune it,
  and an option is a surface to keep.
- **Leave logs in the logger and join them by `requestId`.** Rejected as the
  only answer: it needs a log backend beside the trace backend, and the debug
  bar and MCP tools have no log store. `requestId` on every line is kept as
  well, for production logs.
