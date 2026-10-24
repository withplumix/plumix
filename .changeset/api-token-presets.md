---
"plumix": minor
---

Adds API token presets: a token can now be minted "Read only" or "Draft, can't publish" as well as "Same as me". The admin's mint form offers the three, and `auth.apiTokens.create` takes a `preset` that resolves to an explicit scope list at mint, so later grants never widen the token.
