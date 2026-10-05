---
"plumix": minor
---

Adds a `viewTransitions` option to `defineTheme` that turns on native cross-document page transitions. With `true`, `"always"` or `{ enabled, types }`, public pages carry a `@view-transition` rule, and unless the setting is `"always"`, a rule that turns transitions off for visitors who prefer reduced motion. Your theme's CSS writes the animations. Editor canvas and preview renders never animate. A site turns transitions off or on by spreading the theme it passes to `plumix()`.
