---
"plumix": minor
---

Loads core's own UI catalogs (block render, mails, the welcome screen, the admin bar and admin-area names) per locale, on a locale's first use, so a server isolate loads only the languages it serves. The locales core ships now come from its `.po` files alone, and `plumix i18n compile` fails on a catalog whose file name is not its canonical BCP 47 tag, naming the file to rename it to (for example "rename `zh_CN.po` to `zh-CN.po`"). Breaking: `listAdminAreas` from `plumix/runtime` now returns a `Promise<string>`, so `await` it; and an admin bar node's `bar.locale` is typed `string` instead of the union of shipped locales.
