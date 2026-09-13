---
"@plumix/plugin-seo": minor
"@plumix/plugin-feeds": minor
---

Registers the routes, settings and meta boxes scoped to the site's entry types and taxonomies from the plugin descriptor's `afterSetup` rather than a `theme:ready` subscriber. Requires the `plumix` release that adds `afterSetup`: on an earlier one those registrations never run, so upgrade both together.
