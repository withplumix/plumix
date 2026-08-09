---
"@plumix/core": minor
"@plumix/plugin-media": minor
---

Add per-entity OpenGraph `og:image` from a featured media field.

Theme and plugin authors can mark a media field `media("hero").featured()` (the
entry's representative image) or `media("share").ogImage()` (an explicit
social-share override). Public entry pages now emit a per-entity `og:image` —
resolved as the `ogImage`-role field → the `featured`-role field → the existing
site-wide `default_og_image` — and upgrade the Twitter card to
`summary_large_image`, instead of only the single site default. The field name is
free; the role is what core keys on, and it reads the hydrated media reference
structurally so core takes no dependency on `@plumix/plugin-media`.

`buildManifest` rejects an entry type with more than one `featured` field, and any
role-tagged field that stores multiple values, so a per-entity `og:image` always
resolves to one deterministic image. The Cloudflare edge SVG→PNG rasterization
path and storage-backed serve route are tracked separately (#1708).
