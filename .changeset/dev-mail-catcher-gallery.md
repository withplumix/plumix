---
"plumix": minor
---

Adds mail previews to `plumix dev`. With no `mailer` configured, the dev server now catches each mail instead of dropping it: it logs the message like `consoleMailer()` and keeps it, so email sign-in works in development before a provider is set up, and `auth.magicLink` no longer needs a `mailer` under `plumix dev`. The debug bar has a new Mail panel that lists each mail a request sent and opens it in HTML and text tabs. The new `/_plumix/debug/mail` gallery previews every declared mail from its `preview` props, grouped by owner, with your overrides applied and a switcher for each of your site's locales, and lists the mail caught in dev. `/_plumix/debug/mail/sent` returns the caught mail as JSON, and a `DELETE` empties it. None of this ships in a production build.
