---
"plumix": patch
---

Fixes `plumix dev` and `plumix build` failing with `ENOENT … _plumix/admin/index.html` when both stage the admin into the same project at once. Each now stages the admin in a private directory and swaps the finished copy into place.
