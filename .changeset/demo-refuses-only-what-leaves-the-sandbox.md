---
"@plumix/runtime-cloudflare": minor
---

Narrows the demo gate to what reaches past a visitor's sandbox: API tokens, device sign-in, passkeys, OAuth sign-in and anything that sends email are still refused, while users, sessions, allowed domains and the language setting now work in the demo. The demo admin no longer shows the refused surfaces, and the demo pill lists what's off in the visitor's language. Requires `plumix` 0.25.0 or later.
