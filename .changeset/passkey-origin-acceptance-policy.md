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

`auth.passkey.origin` and `.allowedOrigins` also accept an `(env) => …`
resolver (the same `EnvInput` form as secret slots), so the public origin can be
sourced from a runtime env var (`PUBLIC_ORIGIN`) per deploy instead of hardcoded
— resolved per request, consistent across runtimes rather than reconstructed
from Cloudflare's build-time env. Literal values keep their config-time
validation; resolver forms defer to runtime. The canonical `app.origin` (CSRF,
magic-link, OAuth, sitemap, cron) resolves through the same value.

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
