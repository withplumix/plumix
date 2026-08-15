// Public surface for plugin authors targeting the admin. The
// `SHARED_ADMIN_RUNTIME_SPECIFIERS` const lives in `@plumix/core` so
// admin (which only depends on core) and the consumer-side vite plugin
// can both reach it without depending on plumix itself; we re-export
// here so plugin-author docs can point at a single `plumix/admin`
// surface.
//
// Intended hand-import admin surfaces are `plumix/admin` (this module) and
// `plumix/admin/ui` (the shared shadcn components). The sibling per-lib
// shims (`plumix/admin/react`, `/radix`, `/react-query`, …) are an INTERNAL
// build-tool contract, not that surface: the plugin-bundle Vite step
// rewrites a plugin chunk's bare `react` / `radix-ui` / … imports to them,
// so the chunk shares the admin shell's singletons (React, the QueryClient,
// Lingui's i18n, sonner's Toaster). Authors keep using bare specifiers; the
// shims carry no stability guarantee beyond plumix's pre-1.0 policy.

export { getRuntime } from "./runtime.js";
export type { PlumixAdminRuntime, PlumixGlobal } from "./runtime.js";

export {
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
  adminRuntimeShimSlug,
} from "@plumix/core";
export type { SharedAdminRuntimeSpecifier } from "@plumix/core";
