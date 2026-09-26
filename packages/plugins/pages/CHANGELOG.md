# @plumix/plugin-pages

## 0.2.0

### Minor Changes

- [#2580](https://github.com/withplumix/plumix/pull/2580) [`b10f3ce`](https://github.com/withplumix/plumix/commit/b10f3cea512bd8f5385d49a87e991578b010c917) Thanks [@nasyrov](https://github.com/nasyrov)! - Changes `pages` from a descriptor to a factory that accepts `{ page }`: an override for the `page` entry type (`pages({ page: { rewrite: { slug: "p" } } })`), or `false` to skip it. **Breaking:** replace `pages` with `pages()` in your `plugins` array.

## 0.1.2

### Patch Changes

- [#2347](https://github.com/withplumix/plumix/pull/2347) [`61efc2e`](https://github.com/withplumix/plumix/commit/61efc2ee7b57b53f3342a1f5652d68ad08e85ad7) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes published type declarations that imported `@plumix/core` or `@plumix/blocks`, packages a consumer does not depend on, so the affected types resolved to nothing. `pages`, `fileBlock` and `imageBlock` now name their types through `plumix/plugin` and `plumix/blocks`, and the RPC routers of audit-log, comments, forms, og and seo name the default database schema as `CoreSchema` from `plumix` instead of through `@plumix/core/schema`.

- [#2330](https://github.com/withplumix/plumix/pull/2330) [`6cf3863`](https://github.com/withplumix/plumix/commit/6cf386317aa061f377842dc33ba8995bb61d0b6a) Thanks [@nasyrov](https://github.com/nasyrov)! - Drops `supports: ["slug"]` and `capabilityType: "page"` from the `page` entry type registration — neither had any effect. `slug` had no reader anywhere in core or the admin, and `capabilityType` already matched the type's own name, which is the default it falls back to when unset.

- [#2374](https://github.com/withplumix/plumix/pull/2374) [`ae40bd7`](https://github.com/withplumix/plumix/commit/ae40bd73a6b738092cb4fc1a48eb1b07bbe12b96) Thanks [@nasyrov](https://github.com/nasyrov)! - Fixes `pnpm i18n:extract` destroying `locales/*.po` — it now routes through `plumix i18n extract`, which refuses to run against this package's hand-authored catalog instead of silently rewriting it.

## 0.1.1

### Patch Changes

- [#2010](https://github.com/withplumix/plumix/pull/2010) [`d9cb874`](https://github.com/withplumix/plumix/commit/d9cb87447fd859a1d940dd8ce990571b79b88469) Thanks [@nasyrov](https://github.com/nasyrov)! - Declares the locales each plugin actually ships catalogs for. These five ship
  `ar`/`de`/`uk`/`zh-CN` translations, but their `i18n` slot still named only the
  source locale (`pages` named `en` and `de`), so `buildManifest` projected an empty
  catalog map, omitted the plugin from `pluginI18n`, and never staged a file — a site
  installing the plugin from npm and enabling `ar`, `de`, `uk`, or `zh-CN` got English
  admin chrome in those locales. The translations landed in [#818](https://github.com/withplumix/plumix/issues/818)/[#819](https://github.com/withplumix/plumix/issues/819)/[#822](https://github.com/withplumix/plumix/issues/822)/[#823](https://github.com/withplumix/plumix/issues/823), which
  widened each plugin's `lingui.config.ts` but not the manifest slot;
  `@plumix/plugin-comments` and `@plumix/plugin-og` declared the full set from the
  start and are unaffected. En-only sites see no change either way: a declared locale
  the site has not enabled is intersected out before any URL is emitted.

- [#2009](https://github.com/withplumix/plumix/pull/2009) [`17fa3cc`](https://github.com/withplumix/plumix/commit/17fa3cc4c852a6590bd72696cf535b76adbf4344) Thanks [@nasyrov](https://github.com/nasyrov)! - Ships each plugin's compiled Lingui catalogs in the published tarball. Every one
  of these plugins declares an `i18n` slot pointing at `./locales`, which the
  plumix Vite plugin copies out of the installed package at build time — but
  `package.json#files` allowlisted only `dist`, so the directory was absent from
  the tarball and a site installing the plugin from npm failed `plumix build` with
  `adminAssetNotFound`. Inside this repo a plugin resolves to a symlinked source
  tree, where the catalogs are always present, which is why nothing caught it.
