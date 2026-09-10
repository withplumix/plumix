---
"plumix": patch
---

Closes the freshness gaps left on the platform's own interfaces. The
`api-disabled` 404, the REST `401` for a rejected token, and the CORS preflight
all returned before the `no-store` stamp — and a 404 is heuristically
cacheable, so the disabled-API refusal was the one most likely to be stored.
`/_plumix/api/v1/**` now declares `no-store` on every response it can return.

The directive itself moves to a shared `withNoStore` in `runtime/http.ts`
rather than being written out at each call site.
