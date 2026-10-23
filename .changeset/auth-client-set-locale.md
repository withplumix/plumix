---
"plumix": minor
---

Adds `authClient.account.setLocale(code)`, so a theme sets the signed-in user's locale with no RPC envelope of its own. A code the site hasn't enabled resolves the `locale_not_supported` error and changes nothing. `user.setLocale` now answers `{ locale }`, the enabled locale's code.
