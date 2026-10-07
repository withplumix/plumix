---
"plumix": minor
---

Adds declared mails. `defineMail` (from `plumix/plugin`) declares a mail by name, a plugin lists its mails in its descriptor's new `mails` field, and `ctx.mail.send(name, props, { to })` renders it in the recipient's locale and sends it through the configured `mailer`, throwing `MailerNotConfigured` when there is none. Names and props are typed through `MailRegistry`. A site overrides any mail's `subject`, `text` or `html` with the new `mail.overrides` config slot, and a theme with the new `mail` field on `defineTheme`; the site wins over the theme, and the theme over the mail's own. Two owners declaring one name, or an override of a name nobody declared, now fail the boot. The magic-link and email-change emails are now declared mails (`magicLink`, `emailChange`) with an HTML body beside the text, and go out in the recipient's stored locale when they have one.
