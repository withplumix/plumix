---
"@plumix/runtime-cloudflare": minor
---

Serves a signed-in visitor the anonymous copy of a page with no access policy from Workers Caching, under the same normalized URL anonymous visitors use, so a campaign link or another colo no longer makes them miss. Staff, a member whose locale is their own, and a page whose copy is not the same for everyone still render live, and a signed-in render is never cached. The generated Worker now runs `serveThroughGateway`, which replaces the `sharedCacheRequest` export, and `bindWorkersCache` takes the cached entrypoint's `fetch` beside its `purge`; rebuild to regenerate the entry.
