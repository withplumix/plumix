---
"plumix": patch
---

Fixes the block editor leaving out a theme's blocks when `plumix.config.ts` imports the theme with a `.js` extension, as in `import { theme } from "./theme.js"`.
