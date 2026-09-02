---
"plumix": minor
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

Moves entry generation onto the runtime adapter. `RuntimeAdapter` gains a
required `generateEntry({ configModule })` returning the source of the module
the build serves — the few lines that adapt a platform's serve API to
`PlumixHandler`, which is a module-worker `export default` on Cloudflare and
something else everywhere else. The plumix Vite plugin's pre-emit step asks the
config's runtime adapter for that source when it writes `.plumix/worker.ts`.

Removes `generateWorkerSource` and `WorkerSourceOptions` from `@plumix/core`, so
core no longer dictates one platform's export shape for every runtime. A custom
runtime adapter, or a wrapper such as the demo runtime, must supply
`generateEntry`. The Cloudflare adapter emits byte-for-byte what core emitted
before — the default export with `fetch` and `scheduled`, the asset-manifest and
worker-exports virtual imports, the dev boot-error branch, one memoised handler,
and the positional Worker arguments forwarded into an invocation — so a
Cloudflare site builds, deploys and serves exactly as before.
