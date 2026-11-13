---
"plumix": patch
---

Fixes islands that call `useId` (directly or through Radix or shadcn) hydrating with a mismatch: each server-rendered island now renders as its own root under an `id-prefix` the client mounts with, so its ids match after hydration and two server-rendered islands on one page no longer share an id. `client="only"` islands are unchanged.
