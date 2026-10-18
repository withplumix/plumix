---
"plumix": minor
"@plumix/runtime-cloudflare": patch
---

Replaces the admin's **Management → Mailer** page with `plumix mail test <to>`, which sends core's new `mailTest` mail through the site's mailer and prints the transport's error word for word when it fails. `--remote --url <origin>` sends it through the deployed site instead, with an API token from `--token`, `PLUMIX_API_TOKEN`, or, on a terminal, the site's device flow. Adds `POST /_plumix/api/v1/system/mail/test`, which needs a token whose user may manage settings, answers 204, and answers 502 with the transport's message when the send fails. Removes the `auth.mailer.testSend` RPC. The `mailTest` mail shows in the preview gallery, and a site overrides it by name like any mail. The demo runtime refuses the new route, as it refused the old RPC.
