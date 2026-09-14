---
"@plumix/plugin-media": patch
---

Fixes a failed media admin call (upload, confirm, update, delete, or media
label lookup) to throw the same `ORPCError` shape every other plugin's admin
throws, instead of a plain `Error`.
