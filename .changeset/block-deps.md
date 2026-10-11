---
"plumix": minor
---

Adds `deps` to `defineBlock`, so a block reads settings groups, menus or any other template dep itself, under any template and in the editor canvas. Declare the kinds and keys a template would (`deps: { settings: ["school_ks2"] }`), or derive them from the block's attributes (`deps: (attrs) => ({ menus: [attrs.location] })`), and `render` receives them as `deps`. The page loads every block's deps once, and saving a settings group a block reads purges the pages that render it.

Removes `siteSettings` from a block's `context`. To migrate, declare `deps: { settings: ["site"] }` on the block and read `deps.settings.site` in `render`.
