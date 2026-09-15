---
"plumix": minor
"@plumix/plugin-audit-log": patch
"@plumix/plugin-comments": patch
"@plumix/plugin-forms": patch
"@plumix/plugin-media": patch
"@plumix/plugin-menu": patch
"@plumix/plugin-og": patch
"@plumix/plugin-seo": patch
---

Types `createPluginRpcClient` by the plugin's router: `createPluginRpcClient<typeof router>("menu")` now returns a client with one function per procedure, nested the way the router is (`rpc.locations.list()`), with inputs and outputs inferred from the server's handlers. `PluginRpcClient`, `PluginRpcInputs`, `PluginRpcOutputs` and `PluginRpcRouter`, on `plumix/admin`, name the router, the client and its procedure types. The untyped `rpc.call<T>("procedure", input)` form is gone: import the router type from the plugin's server module with `import type` and pass it as the type argument. The first-party plugins call through the typed client and now require `plumix` 0.23.0 or later.
