---
"plumix": patch
---

Fixes `plumix migrate` running a site's own plugin data migrations ahead of the plugin packages' when the site's path goes through a symlink, such as macOS's `/var` or a linked projects folder.
