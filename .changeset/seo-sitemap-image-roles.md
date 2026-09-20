---
"@plumix/plugin-seo": minor
---

Lists every image role in the sitemap, not just `featured` and `ogImage`. A role a plugin or theme registered with `registerImageRole` now reaches `<image:image>`, and so does a role field nested in a group, which the previous walk could not see. Each role contributes one picture — the first of its fields that resolves — which replaces the ten-per-entry cap.

Fixes the `og:image` chain missing a `.featured()` or `.ogImage()` field nested in a group. Whether a stored reference is a picture is now the reference adapter's own answer rather than a mime check here, so a role field pointed at a non-media kind resolves through that kind instead of resolving nothing.
