---
"plumix": minor
---

Removes the string-named hook API; declare an event or filter with `defineEvent` or `defineFilter`, subscribe with `ctx.events.on` or `ctx.filters.add`, and fire it with `ctx.events.emit` or `ctx.filters.apply`. Breaking:

- The setup context no longer has `addFilter`, `addAction`, `registerFilter` or `registerAction`.
- `ctx.hooks` is gone from `AppContext`, and with it `applyFilter`, `applyFilterSync`, `applyFilterIsolated`, `doAction`, `getFilterHandlers` and `getActionHandlers`. `events` and `filters` are now reserved, so `extendAppContext("events", …)` or `extendAppContext("filters", …)` fails boot.
- `plumix/plugin` no longer exports `FilterRegistry`, `ActionRegistry`, `FilterName`, `ActionName`, `FilterFn`, `ActionFn`, `FilterInput`, `FilterRest`, `ActionArgs`, `HookOptions`, `DEFAULT_HOOK_PRIORITY`, `HookExecutor` or `HookRegistryOptions`. Numeric `priority` is gone; pass `order: "early" | "late"`.
- `HookRegistry` is renamed `HandlerRegistry`, and every option and property that held it is renamed from `hooks` to `handlers`: `installPlugins({ handlers })` and its result, `createAppContext({ handlers })`, `createTestContext({ handlers })`, the app's `handlers`, and a runtime adapter's `prepare(handlers)`.
- `hookStore` and its `HookFrame` are removed from `@plumix/core`.
- The `hook: <name>` trace spans and their `hook.name` and `hook.plugin` attributes are gone; handlers are traced as `event: <id>` and `filter: <id>`.
- `plumix/test` no longer exports `spyAction`, `ActionSpy` or `ActionCall`, the harnesses lose `spyAction`, and `spyFilter` takes only a declared filter. Use `spyEvent` and `spyFilter`.
