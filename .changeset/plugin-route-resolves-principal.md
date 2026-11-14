---
"plumix": patch
---

Fixes a public plugin route (`registerRoute({ auth: "public" })`) always seeing a null `ctx.user`: it now sees the signed-in visitor when the request carries a session. A request carrying only an API token, with no session cookie, resolves nobody there. A `cacheable` route, and a request taking the `formPost` exemption, still see nobody.
