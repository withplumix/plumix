---
"create-plumix-app": patch
---

Fixes `--auth magic-link` scaffolding `mailer: consoleMailer()`, which let a site deploy that logged every sign-in link, token included. The scaffold now writes no mailer: `plumix dev` catches the sign-in mail, and `plumix build` fails until you configure a real transport.
