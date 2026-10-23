---
"plumix": patch
"@plumix/runtime-cloudflare": patch
---

Fixes `plumix <command> --help` (or `-h`) running the command: it now prints that command's usage, description and the runtime's target options, and exits before building or migrating. The Cloudflare `deploy` and `preview` descriptions now say that any other options go to wrangler.
