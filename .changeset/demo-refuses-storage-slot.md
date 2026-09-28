---
"@plumix/runtime-cloudflare": minor
---

Removes the demo gate's media blocks: in a demo, media procedures act only on the per-session database. `demoRuntime` now throws `DemoError` (code `storage_not_supported`) at boot for an app with a `storage` slot. A demo shares one bucket across every session, so it must run without `storage:`.
