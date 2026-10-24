---
"@plumix/runtime-node": patch
"@plumix/runtime-bun": patch
"@plumix/runtime-cloudflare": patch
---

Fixes block strings, mails, the welcome screen and the admin bar rendering in English on a site that enables a regional locale: the generated server entry now hands core the closest catalog for each enabled locale, which `plumix build` works out. Upgrade `plumix` with the adapter.
