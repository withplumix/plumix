---
"create-plumix-app": minor
---

Adds an `--auth <ids>` flag so a non-interactive run can scaffold OAuth (`oauth`), magic link (`magic-link`) and, on Cloudflare, Cloudflare Access (`cfAccess`) alongside passkeys. Like `--plugins`, a flagged `--auth` skips the wizard's auth prompt, and `--auth=` scaffolds passkeys alone. On a terminal, a run that flags everything but `--auth` now asks the auth question; pass `-y` to skip it. An unknown id exits with the list of methods the runtime offers.
