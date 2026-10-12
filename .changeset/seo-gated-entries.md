---
"@plumix/plugin-seo": minor
---

Lists entries of types with an `access` policy in the sitemap and IndexNow, entry by entry, as anonymous visitors may list them, whoever makes the request. A members-only entry is never listed or submitted, and a soft-gated one is. `/llms.txt` now lists each public type's 50 newest entries with their excerpts, never their bodies, and the CDN caches it. A contributed sitemap can name the `access` policy its URLs answer to, and it leaves the index when that policy refuses anonymous visitors.
