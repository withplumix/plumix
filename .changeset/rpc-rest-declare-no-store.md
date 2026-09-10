---
"plumix": minor
---

The RPC and REST surfaces now declare their own freshness instead of leaving it
to whatever cache sits in front of the site. Every `/_plumix/rpc/**` and
`/_plumix/api/v1/**` response carries `cache-control: private, no-store` —
refusals included, which matters because 404 and 405 are both heuristically
cacheable by default. Previously RPC declared nothing at all and REST declared
`no-store` only for PAT-authed principals, and an undeclared response is one a
shared cache is entitled to store under a key any visitor can reach.

A plugin procedure that sets its own `cache-control` through oRPC's
`ResponseHeadersPlugin` no longer keeps it: the surface is uniformly
unshareable.

`/_plumix/rpc/**` also answers any method but POST with a 405. oRPC reads a
GET's input from `?data=` and its router never narrows on method, and the
session cookie is `SameSite=Lax`, so a signed-in victim lured into a top-level
navigation would have returned their own JSON under a URL any visitor can
request. Every first-party client already POSTs — the admin's `RPCLink`,
`@plumix/blocks`, and each plugin admin client — and oRPC's `RPCLink` uses POST
unless told otherwise. A plugin that configured its own client with
`method: () => "GET"` against `/_plumix/rpc/<pluginId>/*` is the one caller
that has to change.
