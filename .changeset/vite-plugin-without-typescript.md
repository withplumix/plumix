---
"plumix": patch
---

Fixes `plumix dev` and `plumix build` failing in a project on TypeScript 7: the Vite plugin now parses config, theme and island source with Vite's own parser instead of importing `typescript`, which plumix never declared as a dependency. Theme modules written in `.tsx` are parsed as TSX, and a `"use client"` module's type-only exports are no longer turned into island shims.
