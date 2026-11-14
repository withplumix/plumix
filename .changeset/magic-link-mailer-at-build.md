---
"plumix": patch
---

Fixes the check that a magic-link site has a mailer running whenever the config loads. `plumix build` and a production boot still fail with `magic_link_requires_mailer` when `auth.magicLink` is set and no `mailer` is configured, but `plumix migrate`, `plumix user` and the other operator commands now run without one. The CLI now prints the error with its code and a hint that points at a real transport instead of `consoleMailer()`, as it prints its other errors, and so does the `plumix mail test` hint.
