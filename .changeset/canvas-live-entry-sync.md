---
"@plumix/core": patch
"@plumix/admin": patch
"@plumix/admin-editor": patch
---

Reflect title, excerpt, meta, and template edits in the editor's visual canvas.

The canvas iframe live-synced only block content over its bridge; the entry
fields the theme template renders around the blocks — title, excerpt, meta,
and a `named`-template pick — stayed at their load-time server render until a
manual reload. Now, after such a field autosaves, the host reloads the canvas
(debounced, coalescing a burst of edits into one reload; block content and the
scroll position are preserved), so the theme output tracks the edit.

Two paths fed the stale output, both fixed:

- The host never signaled the canvas to refresh for these fields. `PlumixEditor`
  gains a `previewRefreshToken` the editor bumps after a title / excerpt / meta /
  template autosave; `CanvasFrame` reloads the iframe when it changes.
- The `?preview=` render itself froze the title. `overlayPreviewAutosave` copied
  `title` from the autosave snapshot, overriding a later live title edit — but
  the title is a live field (written with `saveAs: "live"`, like slug / parent /
  terms, which already came from the live row). The preview now overlays only
  the drafted fields (content, excerpt, meta) and reads the title from live.
