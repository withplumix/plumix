# @plumix/runtime-cloudflare

## 0.2.1

### Patch Changes

- [#1335](https://github.com/withplumix/plumix/pull/1335) [`eb4e600`](https://github.com/withplumix/plumix/commit/eb4e6009b66f3525fa1c5d0dc89f0f6499d2b5e2) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix Cloudflare deploys failing with `The "legacy_env" field is no longer
supported`. `@cloudflare/vite-plugin` is bumped to ^1.45.0, which builds the
  worker config with wrangler 4.111 — matching the wrangler the deploy step runs
  — so the generated `dist/*/wrangler.json` no longer emits the removed
  `legacy_env` field. Builds on wrangler 4.110 produced a config the newer deploy
  wrangler rejected.

## 0.2.0

### Minor Changes

- [#1333](https://github.com/withplumix/plumix/pull/1333) [`b493fbb`](https://github.com/withplumix/plumix/commit/b493fbb4b3cefec54322ea54023129b4ce1d1139) Thanks [@nasyrov](https://github.com/nasyrov)! - `r2()` and `images()` now resolve their configuration from the per-request env
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

### Patch Changes

- Updated dependencies [[`40cf6e6`](https://github.com/withplumix/plumix/commit/40cf6e627521269d8ea5947c86c99fc47447b6b2)]:
  - plumix@0.1.2
