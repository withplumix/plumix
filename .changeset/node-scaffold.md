---
"create-plumix-app": minor
"@plumix/runtime-node": minor
"@plumix/runtime-cloudflare": patch
---

`create-plumix-app --runtime node` scaffolds a site that runs as a plain Node.js process: `node()` as the runtime, `nodeSqlite` on a file under `data/`, `diskStorage` when a plugin needs the storage capability, `.env` as the secrets file with an `.env.example`, `data` ignored, and a literal localhost passkey origin with a comment to change it for production. A plugin needing a capability Node does not provide, such as media's image delivery, is refused by name. The default runtime stays `cloudflare`.

The base skeleton now leaves three things to the runtime: the ambient type packages the tsconfig lists, the README's Deploy section, and what the `clean` script removes. The Cloudflare block declares all three, so its projects are unchanged.
