---
"plumix": patch
---

Fixes plugin strings with a placeholder rendering raw in the admin, such as `Added {label} to the menu`, when no compiled catalog covers the active locale. A plugin's source-locale catalog now always ships with the site, and the admin falls back to it for every locale the plugin doesn't translate. `plumix build` fails when a plugin's `locales/` is missing that compiled source catalog.
