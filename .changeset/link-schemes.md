---
"plumix": minor
---

Adds `LINK_SCHEMES` and `sanitizeHref` to `plumix/blocks`, so every link check reads one allow-list. `sms:` links are now allowed in links, buttons, link and URL fields, and the HTML block. The renderer's `<Link>` now uses the same allow-list as every sanitizer, so it refuses a scheme outside it (such as `ftp:`) and a bare relative path such as `about` instead of rendering an anchor. The HTML block's scheme floor now refuses `file:` too.
