---
"plumix": minor
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

Replaces the positional runtime handler contract with one handler object per
adapter. A runtime adapter now exposes `createHandler(app)` and returns a
`PlumixHandler` whose `fetch(request, invocation)` takes a standard `Request`
plus a single `Invocation` (`env`, optional `waitUntil`, optional
`clientAddress`) and whose optional `scheduled(event, invocation)` runs the
registered scheduled tasks. Core exports `createPlumixHandler`, the default
handler factory that assembles the app context, validates required bindings
once per handler, wires the request-scoped database and its commit step, and
runs the scheduled loop; the Cloudflare adapter is built on it and adds only
the `ASSETS` binding read. The generated Worker entry forwards its positional
`(request, env, ctx)` arguments into an invocation.

Removes `FetchHandler`, `ScheduledHandler`, `buildFetchHandler` and
`buildScheduledHandler`. A custom runtime adapter or a wrapper such as the
demo runtime implements `createHandler` instead. The missing-bindings 500 keeps
its `bindings_missing` code and `missing` list; its message no longer names
wrangler, since the check now lives in core, and the handler's failure log
lines are tagged `[plumix]` rather than `[plumix/runtime-cloudflare]`. A Cloudflare site serves, gates
RPC, validates bindings and runs cron exactly as before.
