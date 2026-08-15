---
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
"create-plumix-app": minor
---

Turn the `kv` slot into a working key/value store.

The `kv` config slot was previously a marker interface with no methods —
accepted in config but never usable at runtime. It now carries a real
`ConnectedKv` contract (`get` / `put` with `expirationTtl` / `delete` / `list`
with prefix + cursor pagination), exposed on the request context as `ctx.kv`
and traced like the `storage` and `cache` slots.

`@plumix/core` ships `memoryKv()`, a backend-agnostic in-memory adapter for dev
and tests (string values, a 1..1000 list page cap; no backend-specific TTL
floor). `@plumix/runtime-cloudflare`'s `kv({ binding })` binds a Workers KV
namespace and implements the same contract. The port is deliberately
runtime-neutral — a Node runtime over Redis would implement the same `KV`
interface.

Usage:

```ts
import { kv } from "@plumix/runtime-cloudflare";

plumix({
  kv: kv({ binding: "SESSIONS" }),
  // ...
});

// in a plugin handler:
await ctx.kv?.put("key", "value", { expirationTtl: 3600 });
const value = await ctx.kv?.get("key");
```

`create-plumix-app` gains a `kv` scaffold capability for the Cloudflare runtime:
a plugin that requires `kv` now automatically wires `kv({ binding: "KV" })` and a
`KV` namespace binding into the generated `wrangler.jsonc`.
