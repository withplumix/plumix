// Public surface for plugin authors targeting the admin. The
// `SHARED_ADMIN_RUNTIME_SPECIFIERS` const lives in `@plumix/core` so
// admin (which only depends on core) and the consumer-side vite plugin
// can both reach it without depending on plumix itself; we re-export
// here so plugin-author docs can point at a single `plumix/admin`
// surface.

export { getRuntime } from "./runtime.js";
export type { PlumixAdminRuntime, PlumixGlobal } from "./runtime.js";

export {
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
  adminRuntimeShimSlug,
} from "@plumix/core";
export type { SharedAdminRuntimeSpecifier } from "@plumix/core";
