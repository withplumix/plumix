---
"@plumix/runtime-cloudflare": minor
---

Moves the Cloudflare adapter and `demoRuntime` to the `handler` spec, and has the generated Worker entry build its handler with `createRuntimeHandler(app)`. Assets, the `cf-connecting-ip` client address and the dev error hints behave as before. Requires the `plumix` release that adds `createRuntimeHandler`.
