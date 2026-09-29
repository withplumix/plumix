---
"plumix": minor
---

Removes `RuntimeAdapter.createHandler(app)`. A runtime adapter now declares `handler: RuntimeHandlerSpec` — `assets`, `disposeTimeoutMs`, `clientAddress`, `prepare` and `wrap`, each optional — and core builds the handler with the new `createRuntimeHandler(app)` from `plumix/runtime`. A generated entry calls `createRuntimeHandler(app)` instead of `config.runtime.createHandler(app)`. `CommandContext.app` is typed as `CommandApp` (`config`, `hooks`, `scheduledTasks`); a command that needs the whole app declares `CommandDefinition<PlumixApp>`.
