---
"plumix": patch
---

Fixes the editor canvas failing to start under `plumix dev` when an installed plugin contributes blocks, such as `@plumix/plugin-media`: no block could be selected because the browser could not load the plugin's `react/jsx-runtime` import. The generated editor entry now imports those block modules so Vite prebundles their dependencies.
