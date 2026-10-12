---
"plumix": minor
---

Adds mail testing to `plumix/test`. The dispatcher and RPC harnesses install a mail fake as `h.mail`, with typed `assertSent`, `assertNotSent`, `assertNothingSent`, `assertSentCount` and `sent(name)`, and it stands in as the site's mailer when the harness config names none. To test a site with no mailer, pass `mailer: undefined`. `fakeMail()` builds a fake on its own, and `renderMail(name, props, { locale, siteName, config })` renders a mail without sending it, with your overrides applied. In end-to-end tests, the `mailbox` fixture of `test` from `plumix/test/playwright` reads the mail `plumix dev` caught: `mailbox.latest(name, { to })` waits for a mail and `mailbox.clear()` empties the caught mail.
