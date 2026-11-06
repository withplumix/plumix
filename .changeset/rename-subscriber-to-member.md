---
"plumix": minor
"@plumix/runtime-cloudflare": patch
"@plumix/plugin-media": minor
---

Renames the `subscriber` role to `member` and retires `contributor` as a default role. The default roles are now `member`, `author`, `editor` and `admin`, with `member` holding exactly what `subscriber` held. A data migration renames `subscriber` to `member` on every user and pending invite. New invites, self-signups, anonymous REST requests and users that `plumix import` or `plumix sync` create without a role now get `member`, and the `memberUser` test factory replaces `subscriberUser` and `contributorUser`.

To keep your contributors, declare a `contributor` role in `plumix({ roles })`. While any user holds `contributor` and the config declares no such role, `plumix migrate`, `plumix dev` and `plumix deploy` stop before changing anything and print a `contributor` role to paste, granting the core rights contributors had on your site. It doesn't include a plugin's own grant to contributors: if you use the media plugin, add `entry:media:delete` to that role, as `"delete"` in its `entry.media` list, so contributors can still delete their own uploads. A site with no contributors migrates without declaring the role.
