---
"@plumix/core": minor
"plumix": minor
"@plumix/runtime-cloudflare": minor
---

Adds `plumix/storage/s3`: an `s3()` object-storage slot that talks to any S3-compatible
bucket — AWS S3, R2 through its S3 API, MinIO, DigitalOcean Spaces, GCS interop — over
`fetch` with a hand-rolled SigV4 signer and no AWS SDK. Config takes `bucket`, `region`,
`endpoint`, `credentials` (a literal or an `(env) => …` resolver read from the handler's
env) and an optional `publicUrlBase`. The slot satisfies the object-storage port in full,
`presignPut` included, and is proven by the conformance suite against an in-memory S3 that
recomputes every signature the way a real bucket does.

The signer ships beside it in both forms: `presignPutUrl` for query-string presigning and
`signRequest` for `Authorization`-header signing, each carrying an STS session token when
the credentials have one. A subpath rather than the root barrel, so a bundle that binds a
native bucket never carries the signer — the route `plumix/db/libsql` took for its driver.

`@plumix/runtime-cloudflare`'s `r2()` keeps its native-binding path and mints presigned
PUTs through the core signer; the package no longer holds a signer of its own.
