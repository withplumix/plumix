---
"@plumix/plugin-seo": minor
---

Marks every view (`registerView`) `noindex` and leaves it out of the sitemap and llms.txt. Adds an `indexViews` option, so `seo({ indexViews: ["compareShare"] })` offers the named views to search engines. A name no plugin registered fails the boot. The indexability reason for a held-out view is `view`.
