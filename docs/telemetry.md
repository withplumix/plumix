# Telemetry span coverage

Per-request tracing is **off by default**: `ctx.telemetry` is a no-op collector
unless a registered consumer (`telemetry: { consumers: [...] }`, or the dev
debug bar) votes to sample the request. When active, spans form a tree rooted
at `dispatch`, delivered to consumers as a `TelemetrySnapshot` via `ctx.defer`
after the response is produced.

## Span vocabulary

| Span | Where | Attributes |
| --- | --- | --- |
| `dispatch` | `runtime/dispatcher.ts` — the whole request | `http.response.status_code` |
| `auth` | `auth/authenticator.ts` | `auth.authenticated`, `auth.user.id` |
| `resolve` | `runtime/dispatcher.ts` — route → entity → template | `route.intent`, `resolve.entity`, `template.matched` |
| `render` | `route/render/render-template.tsx` — themed render, error pages included | `render.node` |
| `template` | child of `render` — template-hierarchy resolution walk | `resolution` (the full explain) |
| `render: deps` | child of `render` — declared template-dep loaders, in parallel | `deps.kinds` |
| `render: head` | child of `render` — SEO gap-fillers (`applyCanonical` + `applyHeadMeta`, reads site settings) | — |
| `render: loaders` | child of `render` — block loader prefetch fan-out | `loaders.blocks` |
| `render: react` | child of `render` — the `renderToString` SSR pass | — |
| `db: <kind>` | `db/trace.ts` — one span per query, all drivers (libsql, D1, transactions) | `db.sql`, `db.params`, `db.rows`, `db.batch` |
| `fetch: <METHOD> <host>` | `context/traced-fetch.ts` — `ctx.fetch` | `http.request.method`, `url.full`, `http.response.status_code` |
| `cache: match` / `cache: put` | `context/traced-slots.ts` — edge-cache lookup/store | `cache.hit` / `cache.tags` |
| `assets: fetch` | `context/traced-slots.ts` — `ctx.assets` (admin shell, static assets) | `url.full`, `http.response.status_code` |
| `storage: <op>` | `context/traced-slots.ts` — `ctx.storage` object I/O (`put`/`get`/`head`/`delete`/`list`) | `storage.key` (`storage.prefix` for `list`) |
| `mailer: send` | `context/traced-slots.ts` — `ctx.mailer` | `mail.to`, `mail.subject` |
| `hook: <name>` | `hooks/registry.ts` — one span per async filter handler | `hook.name`, `hook.plugin` |
| `rpc: <procedure>` | `rpc/build-handler.ts` | — |
| `rest: <procedure>` | `rest/build-handler.ts` | — |
| `mcp: <tool>` | `mcp/server.ts` — `tools/call` | — |
| `cron: <task.id>` | `runtime/scheduled.ts` | — |

The wrap-once pattern: each I/O slot is wrapped a single time at context
assembly (`createAppContext`), so spans appear for every consumer — core,
plugins, and themes alike — without per-call-site instrumentation.

Attributes are captured at full fidelity — `db.params`, `mail.to`,
`storage.key` can carry PII. As with request URLs in the snapshot envelope,
scrubbing is the exporter's responsibility: a consumer shipping snapshots
off-box must redact before export.

## Deliberate exclusions

Known gaps that are by design, not oversights (#1494):

- **MCP `tools/list`** is untraced — it's a static registry read; only
  `tools/call` carries a span.
- **Sync hook pipelines** (`applyFilterSync`, `applyFilterIsolated`, the
  `getFilterHandlers` fan-out) are untraced — they run inside the React render
  pass or are the debug bar's own collection, so tracing them is either costly
  on the hot path or self-referential.
- **Post-response deferred work** is outside the snapshot: edge-cache
  `purgeTags`, consumer export latency, and anything else routed through
  `ctx.defer` after the response. The deferred `cache: put` is the one
  borderline case — its span *starts* inside the request (so it appears in
  the tree) but its duration stamps when the store settles, which may be after
  a consumer serialized the snapshot; treat the duration as best-effort.
- **`ctx.storage.url` / `ctx.storage.presignPut`** are unspanned — plain URL
  math / local signing, not bucket round-trips.
- **`Date.now()` millisecond granularity** can produce occasional negative
  self-times (child durations summing 1–6ms past the parent). An OTel exporter
  wanting monotonic timing should consider `performance.now()`.
- **W3C trace-context propagation** (`traceparent` injection on `ctx.fetch`)
  is absent — trace ids don't exist during the request; the future OTel
  exporter needs a request-mutation seam at that choke point.
