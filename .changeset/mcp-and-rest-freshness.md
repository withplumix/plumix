---
"plumix": patch
---

`/_plumix/mcp` now declares `no-store` like the RPC and REST surfaces beside
it. It was the same gap one surface over, and a reachable one: MCP is
default-off, so the `mcp-disabled` 404 is what every production deployment
returns there, and a 404 is heuristically cacheable. The endpoint's 405, its
cross-origin 403, its 401 and every bearer-authed tool response were undeclared
too.

All three surfaces now stamp freshness once around their dispatcher branch
instead of at each handler exit, so a new exit inside one of them cannot escape
it. `buildRestDispatcher` no longer decides caching at all.

The directive is uniformly `no-store`, without the `private` that RPC and
PAT-authed REST reads carried: `no-store` already binds every cache, shared and
private alike. Page renders and access-gate refusals are unchanged and keep
`private, no-store`, where it sits alongside `Vary: cookie`.
