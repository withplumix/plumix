---
"@plumix/core": minor
---

Adds OAuth sign-in for MCP clients, so Claude, ChatGPT or VS Code can connect to a site with only its URL. The site serves RFC 8414 authorization-server metadata, `/_plumix/oauth/authorize` and `/_plumix/oauth/token`. Clients identify themselves with a Client ID Metadata Document and must use PKCE with S256. The person approves the client on a new admin consent page, which names the client, warns when it only redirects to the person's own machine, and lets them untick capabilities of the requested `read`, `draft` or `full` scope. The client gets a one-hour access token that works only on `/_plumix/mcp`, and reconnecting with access already granted skips the consent page. Signing in from the admin's login page now returns to the page that asked for it. Run the core migration before deploying: it adds the `oauth_grants` and `oauth_authorization_codes` tables.
