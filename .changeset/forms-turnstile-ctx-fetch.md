---
"@plumix/plugin-forms": patch
---

Checks a Turnstile challenge through `ctx.fetch`, so the call to Cloudflare shows as a span in the debug bar, and a check Cloudflare never answers is logged as `timed out after 5s`. It still fails closed after 5 seconds.
