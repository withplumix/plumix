---
"@plumix/plugin-og": minor
---

Contributes its debug panel through core's renamed `debug:panels` filter, and declares the `og` panel id so `dev: { panels: { og: false } }` type-checks.

Breaking against older cores: this release registers on `debug:panels`, which a core older than the release that renamed it does not fire — the OG panel is absent there rather than failing loudly. Upgrade core alongside this plugin.
