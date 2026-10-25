---
"@plumix/plugin-media": minor
---

Declares the plugin's RPC router in its descriptor's type, so a test site that installs it lists its procedures on `site.rpc.media`. The plugin now depends on `@orpc/server`, since its published types name it.
