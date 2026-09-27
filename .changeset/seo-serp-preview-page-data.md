---
"@plumix/plugin-seo": patch
---

Fixes the SERP preview showing a raw shortcode such as `[year]` in the title, and ignoring a `resolve:single:data` subscriber's rewrite. The preview now shows the title the page renders.
