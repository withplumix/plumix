---
"@plumix/plugin-menu": patch
---

Custom menu URLs read the shared link schemes from `plumix/blocks`, so `sms:` links are allowed. A bare `sms:` is refused, like a bare `mailto:` or `tel:`.
