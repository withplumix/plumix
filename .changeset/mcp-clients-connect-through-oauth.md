---
"@plumix/core": minor
---

Adds OAuth sign-in for MCP clients, so Claude, ChatGPT or VS Code can connect to a site with only its URL. The person approves the client on a new admin consent page and can untick capabilities of the requested `read`, `draft` or `full` scope; the client gets a one-hour token that works only on `/_plumix/mcp`. Run the core migration before deploying: it adds the `oauth_grants` and `oauth_authorization_codes` tables.
