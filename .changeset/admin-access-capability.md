---
"plumix": minor
---

Makes opening the admin the `admin:access` capability instead of a rank. Serving the admin and showing the admin bar on public pages both check it, and a signed-in user without it is still redirected to the site. Contributor, author, editor and admin hold it by default, so nobody's access changes.
