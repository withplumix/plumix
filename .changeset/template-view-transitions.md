---
"plumix": minor
---

Adds a `viewTransitions` option to `defineTemplate`, with the same values as the theme's. When a template sets it, it replaces the theme's setting whole for the pages that template renders, including a 404 or 500 template's page: `false` stops transitions to and from those pages, `true` turns them on when the theme leaves them off, its `types` replace the theme's, and `"always"` drops the reduced-motion rule for those pages only. Editor canvas and preview renders still never animate.
