---
"@plumix/plugin-blog": patch
---

Fixes related posts failing on Cloudflare D1 when an entry shares a term with more than 100 others: the lookup now runs as one statement with subqueries instead of binding every sibling id.
