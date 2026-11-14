---
"plumix": patch
---

Fixes an MCP tool call validating its API token again for every RPC procedure the tool runs: the token is now checked once per request, with one `lastUsedAt` write. A procedure reached from a context that already carries a principal runs as that principal, so `createRouterClient(appRouter, { context: site.actingAs(user).context })` in a test now runs as that user. The context carries the credential it was resolved from as `ctx.credential`, and a procedure that creates a credential still refuses an API token however its context was resolved.
