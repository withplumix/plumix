---
"@plumix/plugin-og": patch
---

Fixes an entry's social card redirecting away from the URL its page's head advertises when the title contains a shortcode such as `[year]` or a `resolve:single:data` subscriber rewrites it. The card and the card preview now render the title the page shows.
