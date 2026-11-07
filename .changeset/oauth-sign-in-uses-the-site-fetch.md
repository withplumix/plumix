---
"plumix": minor
---

Makes an OAuth sign-in's code exchange, profile and email lookups go through the site's own `fetch`, so a test site's fake answers them. A custom provider's `fetchVerifiedEmail` now receives that `fetch` as its second argument.
