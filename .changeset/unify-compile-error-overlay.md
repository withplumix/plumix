---
"@plumix/blocks": minor
"plumix": minor
---

Unify Vite's compile/import errors with the dev error surface.

In `plumix dev`, a syntax error or a bad import used to show Vite's own error
overlay — visually and behaviorally disjoint from the plumix dev error page and
the client island overlay. Plumix now disables Vite's built-in overlay
(`server.hmr.overlay: false`) and installs its own from the always-present dev
client entry: it intercepts Vite's `vite:error` HMR payload and renders it
through the *same* shared `DevErrorPage` renderer and token sheet, in a Shadow
DOM modal over a dimmed backdrop. So compile errors now read like every other
plumix dev error — same header, code frame, and styling — and clear on their own
when the module recompiles (Escape, the close button, or a backdrop click also
dismiss). The whole surface is dev-only, gated on `import.meta.hot`, so it
tree-shakes out of the production client bundle; a user can re-enable Vite's own
overlay from their `vite` config.
