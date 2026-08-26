---
"@plumix/core": minor
---

Adds `serveRenderedAsset`, a read-through primitive for bytes that are expensive to produce: a
route hands it a storage key, a content type and a render function, and gets back a response.

A storage hit streams straight back, a miss renders once and persists, and a matching
`If-None-Match` answers 304 without a body. With no `storage:` slot configured the asset still
renders and serves — correct, only uncached. Responses carry the content type, the byte length,
`x-content-type-options: nosniff`, and `cache-control: public, max-age=31536000, immutable` unless
the caller sets its own freshness.

The key is content-addressed by contract: fold every input that changes the output into it, so a
changed input lands on a new key rather than needing an invalidation pass. The ETag derives from
that key rather than from the payload or the storage backend, which is what lets revalidation
match — a digest minted on the render path could never agree with the ETag a backend mints for the
same bytes.
