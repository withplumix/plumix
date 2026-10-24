---
"plumix": minor
---

Adds `allowCustomStyles` to `defineTheme`, so a theme can limit editor styles to its design tokens: `false` for tokens only, or a list of style categories that keep custom values. The editor hides the Custom input, properties without tokens, Custom CSS and class names, and every save refuses a new custom value while keeping the ones an entry already stores.
