# @plumix/runtime-cloudflare

## 0.4.0

### Minor Changes

- [#1422](https://github.com/withplumix/plumix/pull/1422) [`1ff209a`](https://github.com/withplumix/plumix/commit/1ff209a56b1ed3d78e8a6eedb73ceaec056b588d) Thanks [@nasyrov](https://github.com/nasyrov)! - Add a development-only debug bar.

  Running `plumix dev` now renders a per-request debug bar, inspired by the
  WordPress Debug Bar and framework devtools. It is compiled out of production
  builds entirely (gated on `process.env.PLUMIX_DEV`), so it ships nothing to
  production.

  Panels cover the current **Request** (method, path, origin, and the
  authenticated user + token scopes), the resolved **Template** hierarchy (the
  ordered candidate list and which one won), **Database** queries (SQL syntax
  highlighting with the bound params shown separately), an **App** tab
  consolidating the site's static setup (config, locale, wired slots, installed
  plugins, and registered content types), and a **Timeline** waterfall of the
  request's spans — dispatch, resolve, render, and each database query, timed and
  nested by call structure.

  The bar is zero-JS (a server-rendered `<details>` element with CSS-driven tabs)
  and extensible: plugins add panels through the `debug_bar:panels` hook and
  record data through the request-scoped `ctx.debug` collector. Configure it via
  `debugBar` (enable/disable, position, which panels to hide). On Cloudflare, D1
  queries are surfaced in the Database and Timeline panels as well.

## 0.3.1

### Patch Changes

- [#1409](https://github.com/withplumix/plumix/pull/1409) [`9467449`](https://github.com/withplumix/plumix/commit/9467449d397f65ede387c83883f46c0f3064cc2f) Thanks [@nasyrov](https://github.com/nasyrov)! - Fix the visual editor being unusable under the Cloudflare demo runtime (and behind any non-cookie authenticator). Public-route renders only loaded the signed-in user when the standard `plumix_session` cookie was present, so a session established by a different signal — the demo's `plumix_demo` cookie, or Cloudflare Access's JWT header — rendered as anonymous. That left the editor's canvas iframe without its runtime, so blocks couldn't be selected, inserted, edited, or moved and the canvas wouldn't pan. Authenticators can now declare an optional `hasSession(request)` predicate so public renders recognise their sessions; the built-in demo and Cloudflare Access guards implement it. Also stops the demo toolbar pill from leaking into the editor canvas.

- Updated dependencies []:
  - plumix@0.1.4

## 0.3.0

### Minor Changes

- [#1358](https://github.com/withplumix/plumix/pull/1358) [`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756) Thanks [@nasyrov](https://github.com/nasyrov)! - Add an anonymous demo sandbox through the new `@plumix/runtime-cloudflare/demo` subpath. `demoPreset({ binding, loadSql, turnstile? })` returns a `runtime`/`database`/`auth` trio that hands every anonymous visitor an isolated, self-expiring Cloudflare Durable Object database — no sign-up — so a site can showcase its admin and editor.

  Cookieless visitors render a shared, read-only "showcase" database; clicking through provisions a per-session sandbox on demand, which self-cleans on a TTL alarm. Media writes are blocked (the storage bucket is shared) and security-sensitive routes are refused. Optional Turnstile gates provisioning against bots. The whole module is code-isolated on the subpath, so sites that don't opt in never bundle it.

### Patch Changes

- [#1361](https://github.com/withplumix/plumix/pull/1361) [`fc7aaab`](https://github.com/withplumix/plumix/commit/fc7aaab84c3e8e976b003660150f6c1c5a1286d4) Thanks [@nasyrov](https://github.com/nasyrov)! - Show the demo "Try the editor" CTA only to anonymous showcase visitors. It previously rendered for everyone, including inside the editor's own live preview and on the public site once a session existed. Adds `hasDemoSession(request)` (exported from `@plumix/runtime-cloudflare/demo`) so a theme can gate the CTA on the demo session cookie — `ctx.user` can't stand in, since core only resolves the public-render user for the default session cookie, not a custom authenticator's.

- [#1362](https://github.com/withplumix/plumix/pull/1362) [`100032d`](https://github.com/withplumix/plumix/commit/100032d84e6b757dd53ae8cbd5151e6c26d30eee) Thanks [@nasyrov](https://github.com/nasyrov)! - Make the demo toolbar responsive. Its contents used to wrap onto several cramped lines on narrow screens; it now stays a single-line pill at every width — the countdown and controls never wrap (`white-space: nowrap`), the pill is capped to the viewport, the deploy CTA shortens to "Deploy" on phones, and the bar clears the iOS home indicator via the safe-area inset.

- Updated dependencies [[`17658a5`](https://github.com/withplumix/plumix/commit/17658a53b3fb2f5135527a6f6a195f8c5aa49756)]:
  - plumix@0.1.3

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
