# @plumix/runtime-cloudflare

The **Cloudflare Workers runtime** for Plumix — the adapters that wire your site to D1, R2, KV, Images, and the edge cache. It's the first of Plumix's pluggable runtimes; the CMS itself is runtime-agnostic, so this package is swappable.

## Install

```bash
pnpm add @plumix/runtime-cloudflare
```

Your worker needs Node compatibility. In `wrangler.jsonc`:

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
}
```

## Usage

Each adapter is a small factory you slot into the matching field of your `plumix.config.ts`:

```ts
import { auth, plumix } from "plumix";

import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  images,
  r2,
} from "@plumix/runtime-cloudflare";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  storage: r2({ binding: "MEDIA", publicUrlBase: "https://media.example.com" }),
  imageDelivery: images({ zone: "media.example.com" }),
  auth: auth({
    passkey: {
      rpName: "My Site",
      // Spread all three fields (rpId, origin, allowedOrigins) — the wildcard
      // in allowedOrigins is what lets one passkey span every preview branch.
      ...cloudflareDeployOrigin({
        workerName: "my-site",
        accountSubdomain: "my-account",
        localOrigin: "http://localhost:5173",
        // productionOrigin: "https://example.com", // if prod is on a custom domain
      }),
    },
  }),
});
```

## Adapters

| Factory                               | Field           | What it does                                                                                                                                    |
| ------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare()`                        | `runtime`       | Bridges the Workers environment to Plumix.                                                                                                      |
| `d1({ binding, session })`            | `database`      | D1 (SQLite). `session` is `"disabled"` \| `"auto"` \| `"primary-first"` for read replication.                                                   |
| `r2({ binding, publicUrlBase, s3 })`  | `storage`       | R2 object storage. Add `s3` credentials to enable presigned-PUT uploads.                                                                        |
| `images({ zone })`                    | `imageDelivery` | Cloudflare Image Transformations URLs. `zone` is a hostname, no protocol.                                                                       |
| `edge({ ttl, staleWhileRevalidate })` | `cache`         | Edge cache (Cache API + purge-by-tag).                                                                                                          |
| `kv({ binding })`                     | `kv`            | Cloudflare KV.                                                                                                                                  |
| `cloudflareDeployOrigin({ … })`       | —               | Derives `rpId` + `origin` + `allowedOrigins` from the Workers Builds env; `productionOrigin` for a custom domain, `localOrigin` for `pnpm dev`. |

Each `binding` matches a resource declared in your `wrangler.jsonc` (`d1_databases`, `r2_buckets`, `kv_namespaces`).

## Notes

- **`cloudflareDeployOrigin`** anchors the passkey `rpId` to the account registrable domain (`<account>.workers.dev`) and returns an `allowedOrigins` wildcard for it, so one passkey enrolled once works on production _and_ every per-branch preview URL. `origin` still reflects the specific deploy host (production `<worker>.<account>.workers.dev`, preview `<branch>-<worker>.<account>.workers.dev`, local your `localOrigin`). For a custom-domain production deploy, pass `productionOrigin: "https://example.com"` — Workers Builds can't expose the custom domain, so it must be declared. (A custom domain and `workers.dev` are different registrable domains, so no single passkey spans both — sign in to those previews with magic-link or Cloudflare Access.)
- **`edge()` is dormant until you attach a zone.** It reads `CF_ZONE_ID` + `CF_CACHE_PURGE_TOKEN` from the worker env and renders live (no caching) when either is missing — so it's a safe no-op on `*.workers.dev`.
- **Presigned R2 uploads** need bucket CORS rules and S3 credentials; see [`@plumix/plugin-media`](../../plugins/media) for the details.

## Support

Have a question? Start a [discussion](https://github.com/withplumix/plumix/discussions). Found a bug? [Open an issue](https://github.com/withplumix/plumix/issues).

## Contributing

PRs and ideas welcome. The [Contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md) gets you set up — new contributors especially welcome.

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
