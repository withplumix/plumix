---
"@plumix/core": minor
---

Adds `PlumixApp.loadMcpHandler`, mirroring `loadRestHandler`: the MCP entry point now loads through
a memoized loader on the app rather than a module-scoped one shared across everything in the
isolate. The handler's shape is exported as `McpHandler`. `createDispatcherHarness` gains a
`coldInterfaces` option for substituting either cold-interface loader, so a test can assert that a
disabled interface is never reached for.
