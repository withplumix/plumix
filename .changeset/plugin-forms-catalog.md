---
"@plumix/plugin-forms": minor
---

Adds the plugin's own translation catalogs, so the submissions inbox and the block's editor entry
read in the administrator's locale rather than always in English.

The strings were already authored as Lingui descriptors, but with no `lingui.config.ts` and no
`locales/`, `pnpm i18n:check` skipped the package and no translator could reach any of them. It now
carries the same pipeline its peers do: `i18n:extract`, `i18n:compile` and `i18n:check` scripts, an
`i18n` block on the plugin descriptor naming the catalog directory, and `en`, `uk`, `ar`, `de` and
`zh-CN` catalogs covering all 52 descriptors. The compiled catalogs are in `files`, so an installed
copy carries them rather than falling over on the consumer's `plumix build`.

The rendered form is unchanged. A plugin has no catalog at render time on the public path, where a
`Label` is flattened to its source message, so a visitor still reads the authored English — the ten
descriptors it shows are in the catalogs, but nothing resolves them there yet. The validation
messages beside them in `src/messages.ts` are still template-literal functions rather than
descriptors: each needs an ICU message before a catalog can hold it, tracked in #2083.
