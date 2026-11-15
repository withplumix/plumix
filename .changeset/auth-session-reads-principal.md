---
"plumix": patch
---

Fixes `auth.session` returning no user for a caller whose context already carries one, such as a `plumix/test` client built from `actingAs(user).context`; an MCP tool reading the session no longer validates its token a second time.
