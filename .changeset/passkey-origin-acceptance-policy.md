---
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

Accept a set of passkey origins so custom domains and preview deploys can enrol.

`auth.passkey` gains an optional `allowedOrigins` — extra origins the WebAuthn
ceremony accepts alongside `origin`, each an exact origin
(`https://www.example.com`) or a subdomain wildcard
(`https://*.acme.workers.dev`). Every entry's host must be `rpId` or a subdomain
of it (the registrable-suffix rule), validated at config time. `rpId` is still
the sole anchor and is never derived from the request, so a policy can only
*accept* origins the operator declared — never widen the set from a
request Host. Verification stays pinned to `origin` when `allowedOrigins` is
unset, so existing single-host deploys are unchanged.

`cloudflareDeployOrigin()` now anchors `rpId` to the account registrable domain
(`<account>.workers.dev`) and returns `allowedOrigins:
["https://*.<account>.workers.dev"]`, so one passkey enrolled once is valid on
production **and** every per-branch preview URL. It also accepts
`productionOrigin` for deploys served on a custom domain, which Workers Builds
cannot expose to the build.

**Breaking (`@plumix/runtime-cloudflare`):** `cloudflareDeployOrigin()` no longer
returns the full worker host as `rpId` — production now yields
`rpId: "<account>.workers.dev"` instead of `rpId: "<worker>.<account>.workers.dev"`.
Passkeys enrolled against the old per-worker `rpId` must be re-enrolled once
after upgrading. A custom domain and `workers.dev` remain different registrable
domains, so no single passkey spans both — authenticate custom-domain-production
previews with an origin-agnostic method (magic-link / Cloudflare Access).
