---
"plumix": patch
---

Fixes the og card preview and the seo SERP preview reading a pending autosave differently from the page's own preview render. Both now keep the entry's saved per-entry access choice, so the card panel answers as the page does, and neither passes reserved `__plumix_*` meta through to the page data.
