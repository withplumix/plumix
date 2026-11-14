---
"plumix": minor
---

Fixes `vite.plugins` in `plumix.config.ts` being silently ignored: the plugins it lists now run in `plumix dev` and `plumix build` on every runtime, after Plumix's own. `plumix()` from `plumix/vite` now returns a Vite `PluginOption` (its own plugin plus the site's), so code that read its hooks directly takes the first element: `const [plugin] = plumix()`.
