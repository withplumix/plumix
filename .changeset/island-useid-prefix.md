---
"plumix": patch
---

Fixes islands that call `useId` (directly or through Radix or shadcn) hydrating with a mismatch: each island now server-renders as its own root under an `id-prefix` the client mounts with, so its ids match after hydration and two islands on one page no longer share an id.
