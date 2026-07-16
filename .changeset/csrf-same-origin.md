---
"@plumix/core": patch
---

Accept same-origin requests in the RPC/auth CSRF origin check. The check compared the request `Origin` against the canonical `app.origin` (from `auth.passkey.origin`); a deploy served on a different host than its configured origin — including the demo sandbox, whose origin varies per deploy — failed with `csrf_origin_mismatch` on every admin request. A request whose `Origin` equals the host it targets is not cross-site forgery, so it now passes the origin check. The `X-Plumix-Request` header gate remains the primary CSRF defense, and cross-origin requests are still rejected.
