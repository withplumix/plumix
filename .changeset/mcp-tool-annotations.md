---
"plumix": minor
---

Adds an optional `annotations` object to an MCP tool, so a tool registered with `ctx.registerMcpTool` can declare that it writes with `readOnlyHint`, `destructiveHint` and `idempotentHint`. A tool that sets none is still listed as read-only. The MCP server now follows spec 2026-07-28 on SDK v2 and reports Plumix's version. A tool call with a bad input, or a tool that throws an error other than `McpToolError`, now comes back as an `isError` result instead of a JSON-RPC error.
