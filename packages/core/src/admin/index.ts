// Barrel-free (runtime.js imports nothing, rpc-errors.js only valibot) so
// browser callers reach the build-time runtime-alias constants without
// dragging the root barrel's `node:async_hooks` into an esbuild-for-browser
// graph — `plumix/admin` re-exports them, and its `getRuntime` can land in a
// plugin chunk.
export * from "./runtime.js";
export * from "./rpc-errors.js";
