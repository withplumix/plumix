---
"@plumix/runtime-node": minor
---

Requires `plumix` 0.24.0 or later, and applies the request trust and asset rules from `plumix/runtime` instead of its own copies. The rules behave the same. One exception: `createRequestListener` no longer infers `https` from a TLS socket. Mounted on `node:https`, it now builds `http://` URLs unless `trustProxy` is on and the request carries `x-forwarded-proto`.
