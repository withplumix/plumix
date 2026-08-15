---
"@plumix/core": minor
---

Add a browser-safe `@plumix/core/admin` subpath exposing the admin
runtime-alias constants (`SHARED_ADMIN_RUNTIME_SPECIFIERS`,
`adminRuntimeShimSlug`, and the `SharedAdminRuntimeSpecifier` type).

`plumix/admin` co-exports the browser-facing `getRuntime` accessor with these
build-time constants. They were reached through the flat `@plumix/core` root
barrel, which statically imports `node:async_hooks` (via the request-context
stores) — so a plugin chunk importing `plumix/admin` for `getRuntime` would
fail its esbuild-for-browser build on the unresolved `node:async_hooks`. The
constants now come from the barrel-free `@plumix/core/admin` subpath instead.

Migration: none. The root barrel still re-exports the same constants (so
server-side consumers are unchanged); `@plumix/core/admin` is an additional,
browser-safe way to reach them.
