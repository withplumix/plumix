---
"@plumix/core": minor
---

Keeps OAuth clients connected with rotating refresh tokens: `/_plumix/oauth/token` now also returns a refresh token that lasts 30 days and is replaced on every use, so an MCP client never holds a long-lived secret. Presenting a refresh token that was already used revokes every access and refresh token of that grant, so a stolen one locks the thief out. Run the core migration before deploying: it adds the `oauth_refresh_tokens` table.
