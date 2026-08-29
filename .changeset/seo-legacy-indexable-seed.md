---
"@plumix/plugin-seo": patch
---

Fixes a site that had turned off indexing under the old `site.public` key reading back as indexable
in the SEO settings form — and being saved that way, turning search indexing back on. The migration
that seeds a legacy answer into the new `seo` group skipped whenever the key was already present,
and `settings.get` now fills a registered default into the bag before the filter sees it, so
`indexable` always looked answered. Presence is read off what storage holds instead.
