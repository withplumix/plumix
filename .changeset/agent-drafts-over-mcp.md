---
"plumix": minor
---

Adds `content_create` and `content_update` MCP tools, so an agent can create and edit drafts over MCP under the admin's rules: a token's scopes, `ifMatch`, edit leases and block validation all apply. `content_get` now returns the entry's `etag`, and a refused write answers with a `conflict`, `locked` or `invalid_content` code in `_meta.code`.
