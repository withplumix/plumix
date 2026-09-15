---
"@plumix/plugin-og": patch
---

Fixes `pnpm i18n:extract` destroying `locales/*.po` — it now routes through `plumix i18n extract`, which refuses to run against this package's hand-authored catalog instead of silently rewriting it.
