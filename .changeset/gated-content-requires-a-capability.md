---
"plumix": minor
---

Adds `capabilityPolicy(capability)` to `plumix/auth`, so a route or entry can require a capability rather than a role. A viewer holding it gets the new built-in `capability:<name>` segment, a signed-in viewer without it gets a 403, and an anonymous visitor is sent to sign-in. The CDN stores one copy per `capability:` segment, shared by every viewer who holds the capability. `rolePolicy` and `role:` segments keep working for now.
