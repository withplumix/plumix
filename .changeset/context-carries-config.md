---
"plumix": minor
---

Adds `ctx.config`, the app's resolved config, and removes the context's copies of it: read `ctx.config.basePath`, `ctx.config.i18n`, `ctx.config.images?.remotePatterns` and `ctx.config.auth.magicLink?.siteName` instead of `ctx.basePath`, `ctx.i18n`, `ctx.imageRemotePatterns` and `ctx.siteName`. Removes `app.basePath` (use `app.config.basePath`). `createAppContext` takes `config`, and the `plumix/test` harnesses take slot options under `config`: `createDispatcherHarness({ config: { plugins, basePath, auth: { magicLink } } })`, with `oauth` moving to `config.auth.oauth.providers`, and `createRpcHarness` and `createTestContext` taking `mailer` and `siteName` as `config: { mailer, auth: { magicLink: { siteName } } }`.
