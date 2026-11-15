---
"@plumix/core": patch
---

Fixes a `cacheable` public route resolving the visitor below its handler. A procedure or `resolvePrincipal` call the handler reaches now resolves nobody, signed in or not, so no stored copy holds a member's render.
