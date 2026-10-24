---
"plumix": minor
---

Opening the admin now requires the `admin:access` capability instead of a rank. Core grants it to contributor, author, editor and admin, so nobody's access changes. The admin bar on public pages follows the same capability, and a plugin that registers `admin:access` now decides who may open the admin.
