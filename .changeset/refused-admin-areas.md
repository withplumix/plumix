---
"plumix": minor
---

Adds `refusedAdminAreas` to the runtime adapter contract. A runtime that refuses API tokens, device sign-in, passkeys, OAuth sign-in or email delivery for every visitor declares it there, and the admin hides those cards, pages and actions (and the Mailer page, under email delivery) instead of offering ones that can only fail. `listAdminAreas` from `plumix/runtime` names the areas in the visitor's language.
