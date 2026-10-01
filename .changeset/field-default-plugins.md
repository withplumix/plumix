---
"@plumix/plugin-media": patch
"@plumix/plugin-menu": patch
"@plumix/plugin-comments": patch
---

Fixes a new media entry, menu or menu item skipping the defaults of fields another plugin registered on its entry type or the `menu` taxonomy; it now starts from them, like any other new entry. The comments plugin passes the starting user meta when it checks a commenter's session, so a user an authenticator provisions there starts from the user fields' defaults too.
