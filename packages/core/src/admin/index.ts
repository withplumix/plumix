// Barrel-free (runtime.js imports nothing) so browser callers reach the
// build-time runtime-alias constants without dragging the root barrel's
// `node:async_hooks` into an esbuild-for-browser graph — `plumix/admin`
// re-exports them, and its `getRuntime` can land in a plugin chunk.
export * from "./runtime.js";
