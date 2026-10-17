---
"@plumix/plugin-menu": patch
---

Reads the shared link schemes from `plumix/blocks` for custom menu URLs, so `sms:` links are allowed. A bare `sms:` is refused, like a bare `mailto:` or `tel:`.
