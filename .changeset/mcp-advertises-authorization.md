---
"@plumix/core": minor
---

Adds authorization discovery to the MCP endpoint. It serves RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource` and at the path-specific URI for `/_plumix/mcp`, including under a `basePath`. A 401 now carries a `WWW-Authenticate: Bearer` challenge with `resource_metadata` and `scope`. An MCP tool can declare the `capability` it needs, and a token whose capabilities don't cover it gets 403 `insufficient_scope` naming the scope to ask for.
