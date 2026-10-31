---
"plumix": patch
---

Speeds up `plumix build` and ends its `[PLUGIN_TIMINGS]` warning about the `plumix` plugin's `buildStart`. The admin is staged once per build instead of once per environment, the plugins' admin bundle is built with Rolldown instead of esbuild, and it now ships only the icons and modules the plugins use, so the demo's bundle drops from 1.4 MB to 230 KB. Under `plumix dev`, editing a plugin's admin code now rebuilds its bundle and reloads the admin.
