---
"@plumix/blocks": patch
"plumix": patch
---

Fixes `useAuth` returning a React element instead of running during the server render. The module
carried a `"use client"` directive, and the directive marks an _island_ — the SSR pass replaces
every export of a module carrying one with a shim component — so a theme doing
`const { user, loading } = useAuth()` read `undefined` for both on the server and rendered its
signed-out branch with no loading state. The hook now runs on the server, settling to
`{ user: null, loading: true }` until the client probe resolves, which is what a cache-shared
anonymous render should say. The build now refuses a first-party `"use client"` module that
exports a hook-shaped name rather than shimming it; a dependency's own hook exports are left
alone.
