---
"@plumix/plugin-og": patch
---

Documents the plugin on the documentation site — declaring cards, the `og:image` chain, the three
preview surfaces — and writes down the four failures that produce no error message: WOFF2 fonts the
engine cannot read, the free plan's 10 ms CPU limit (which applies to scheduled handlers exactly as
to fetch handlers, so the featured-image crop is the path a free-plan site uses), `svgOnly()` not
shrinking the bundle, and images never being fetched. Corrects the README's Worker size ceiling,
which quoted the free plan's 3 MB beside a paragraph about needing a paid one, and adds a
live-registry test pinning what the package's `plumix.scaffold` block composes.
