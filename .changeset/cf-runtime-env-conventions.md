---
"@plumix/runtime-cloudflare": minor
"@plumix/core": patch
---

`r2()` and `images()` now resolve their configuration from the per-request env
by convention, so a Cloudflare deploy's `plumix.config.ts` stays declarative
instead of reading `process.env` at module load (which is empty on Workers).

- `r2({ binding })` reads S3 presigned-upload credentials (`CF_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `<BINDING>_BUCKET`) and
  `publicUrlBase` (`<BINDING>_PUBLIC_URL_BASE`) from the request env when the
  corresponding config slots are omitted. Explicit config always wins;
  presigned uploads stay disabled until all four credentials are present.
- `images()` is now callable with no arguments and gains an optional
  `connect(env)` step, resolving its zone from `MEDIA_PUBLIC_URL_BASE` at
  request time and passing sources through untouched until that host is set.
- `@plumix/core`'s `ImageDelivery` interface gains an optional `connect(env)`
  so runtimes can bind env-time image configuration.

Backward compatible: existing explicit `r2({ ..., s3, publicUrlBase })` and
`images({ zone })` configs are unchanged.
