---
"plumix": minor
---

Adds an audience to API tokens: a token bound to the site's MCP endpoint works only on `/_plumix/mcp`, and REST and RPC refuse it. Bound tokens start with `pl_aud_`. Existing tokens have no audience and keep working everywhere. A core migration adds the two token columns.
