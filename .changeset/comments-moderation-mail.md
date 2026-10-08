---
"@plumix/plugin-comments": minor
---

Sends the moderator notification as the declared mail `commentAwaitingModeration`: a localized subject and text naming the comment's author and entry, the comment itself, a link to the moderation queue, and an HTML body. A site or theme can override it by name. It still sends nothing on a site with no mailer.
