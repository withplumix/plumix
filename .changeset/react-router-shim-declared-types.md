---
"plumix": patch
---

Removes `@tanstack/router-core` and `@tanstack/history` from plumix's dependencies. `plumix/admin/react-router`'s types now reference only `@tanstack/react-router`, and every binding's type is unchanged.
