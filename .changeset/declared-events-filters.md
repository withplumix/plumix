---
"plumix": minor
---

Adds declared events and filters. Declare one with `defineEvent<Payload>(id)` or `defineFilter<Value, Input>(id, { sync })` from `plumix/plugin` and list it in your plugin's `events` or `filters`; two declarations sharing an id fail boot, with no `declare module` needed. Subscribe in `setup` or `afterSetup` with `ctx.events.on(event, handler, { order })` and `ctx.filters.add(filter, handler, { order })`, and fire through `ctx.events.emit(event, payload)`, which resolves to the handlers that failed, and `ctx.filters.apply(filter, value, input)`. Event handlers take `(payload, ctx)` and filter handlers `(value, input, ctx)`, and handlers run `early`, then unset, then `late`, core first, then in the site's `plugins` order. `plumix/test` adds `spyEvent`, and `spyFilter` and the harnesses' `h.spyFilter` take a declared filter.

Breaking: the block extension points move to core's `block` subject, exported from `plumix/plugin`. Replace `addFilter("block:before_render", …)` and `addFilter("block:after_render", …)` with `ctx.filters.add(block.beforeRender, …)` and `ctx.filters.add(block.afterRender, …)`, and `addFilter("blocks:loader:error", …)` with `ctx.events.on(block.loaderFailed, …)`. `BlockRenderHookContext` is now `BlockRenderInput` and `BlockLoaderErrorContext` is now `BlockLoaderFailure`. `createAppContext` takes a `HookRegistry` as `hooks`.
