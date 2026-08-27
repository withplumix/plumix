---
"@plumix/plugin-audit-log": patch
"@plumix/plugin-blog": patch
"@plumix/plugin-media": patch
"@plumix/plugin-menu": patch
"@plumix/plugin-pages": patch
---

Declares the locales each plugin actually ships catalogs for. These five ship
`ar`/`de`/`uk`/`zh-CN` translations, but their `i18n` slot still named only the
source locale (`pages` named `en` and `de`), so `buildManifest` projected an empty
catalog map, omitted the plugin from `pluginI18n`, and never staged a file — a site
installing the plugin from npm and enabling `ar`, `de`, `uk`, or `zh-CN` got English
admin chrome in those locales. The translations landed in #818/#819/#822/#823, which
widened each plugin's `lingui.config.ts` but not the manifest slot;
`@plumix/plugin-comments` and `@plumix/plugin-og` declared the full set from the
start and are unaffected. En-only sites see no change either way: a declared locale
the site has not enabled is intersected out before any URL is emitted.
