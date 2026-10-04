---
"@plumix/runtime-cloudflare": patch
---

Fixes demo deploys pointing every canonical and `og:url` at `https://demo.localhost`. The demo preset now builds its site origin from `PUBLIC_ORIGIN`, and when a deploy sets none the demo runtime uses the host the request came in on.
