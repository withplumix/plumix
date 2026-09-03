---
"plumix": minor
"@plumix/core": minor
---

Keeps fire-and-forget work alive on a runtime that has no `waitUntil`. When an
invocation supplies one, `ctx.defer` routes through it exactly as before. When
it does not — a long-lived Node, Bun or Deno process — the default handler
tracks the promise in a per-handler pending set, and the handler's new optional
`dispose()` drains that set so an adapter can await telemetry delivery and cache
purges on `SIGTERM` instead of losing them.

The drain follows work that deferred work defers in turn — a telemetry
consumer that purges a cache tag, say — so a nested task is not dropped
because it arrived after the drain began. `dispose()` gives up after
`disposeTimeoutMs` (five seconds by default, set through
`createPlumixHandler(app, { disposeTimeoutMs })`) and logs how many tasks it
abandoned, so work that never settles cannot hold a shutdown open. The deadline
is absolute, so a chain of nested tasks cannot extend it either.

Rejections keep routing through `ctx.logger` in both modes, so a failing
deferred task is a log line and never an unhandled rejection.

On Cloudflare `dispose()` is present and resolves at once: every invocation the
Worker entry builds carries `waitUntil`, so nothing is ever tracked. The test
runtime's `createDeferQueue()` and its `drainDeferred()` are unchanged.
