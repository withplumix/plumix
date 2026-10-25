---
"plumix": minor
---

Adds `plumix/lingui`, the Lingui config a plugin compiles its catalogs with: `defineLinguiConfig({ rootDir: import.meta.dirname })` finds the plugin's locales from its `.po` files, so adding `pt-BR.po` needs no config edit, and fills each message a partial regional catalog lacks from its CLDR parent (`de-AT` from `de`, never `zh-Hant` from `zh`). `plumix i18n init` now scaffolds a `lingui.config.ts` that uses it and no longer adds `@lingui/format-po`; an existing plugin can replace its `defineConfig` call with the helper and drop that dependency.
