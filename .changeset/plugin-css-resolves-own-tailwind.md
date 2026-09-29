---
"plumix": patch
---

Fixes `plumix build` and `plumix dev` failing with `Can't resolve 'tailwindcss/theme'` when a site with plugin admin code is built without `tailwindcss` resolvable from the project root, as with `bun --bun` on an isolated install. The plugin stylesheet now compiles against the Tailwind that `plumix` itself depends on.
