# @plumix/plugin-media

Media library for Plumix. Registers a `media` entry type, RPC procedures
for uploads, and an admin Media Library page (grid + thumbnails +
drag-to-upload + delete + alt-text editing + Copy URL + infinite scroll).

Two upload modes, picked automatically based on what your runtime
exposes:

- **Presigned PUT** — bytes go straight from the browser to your bucket
  via an AWS-SigV4 query-signed URL. No worker hop, no CPU cost on
  upload. Requires S3 API credentials (see below) and bucket CORS rules.
- **Worker-routed** — bytes flow through the worker via the storage
  binding's `put()`. Works the moment the binding is attached, no
  credentials or CORS configuration. Capped at the runtime's request-
  body limit (~100 MiB on Workers free).

You don't pick — `media.createUploadUrl` returns a presigned URL when
`storage.presignPut` is wired up, otherwise a `/_plumix/media/upload/<id>`
URL routed through the worker. The browser PUTs to whichever it gets.

## Install

```bash
pnpm add @plumix/plugin-media
```

Wire it into `plumix.config.ts`. The plugin reads two slots from the
host config: `storage` (where bytes live) and `imageDelivery` (how
thumbnails are derived). The Cloudflare runtime ships compatible
implementations.

```ts
import { auth, plumix } from "plumix";

import { media } from "@plumix/plugin-media";
import { cloudflare, d1, images, r2 } from "@plumix/runtime-cloudflare";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  storage: r2({
    binding: "MEDIA",
    publicUrlBase: "https://media.example.com",
    s3: {
      bucket: "my-media-bucket",
      accountId: process.env.CF_ACCOUNT_ID!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  }),
  imageDelivery: images({ zone: "media.example.com" }),
  auth: auth({
    passkey: {
      /* … */
    },
  }),
  plugins: [media()],
});
```

`wrangler.jsonc`:

```jsonc
{
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "my-media-bucket" }],
}
```

## R2 CORS (only required for presigned-PUT mode)

Skip this section if you're running on the binding-only path — the
worker-routed upload is same-origin so no CORS rules are needed.

For presigned PUTs, the browser hits R2 directly. Without CORS rules on
the bucket, the request fails before the bytes ever reach R2. Apply
this once per bucket:

```bash
wrangler r2 bucket cors put my-media-bucket --rules '[{
  "AllowedOrigins": ["https://your-admin.example.com"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["Content-Type"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]'
```

Add every origin you serve the admin from (production, preview deploys,
`http://localhost:8787` for local dev with `wrangler dev`).

## Image Transformations (optional)

`imageDelivery: images({ zone })` turns image URLs into Cloudflare
Image Transformations URLs (`/cdn-cgi/image/<opts>/<src>`). The zone
must be a Cloudflare zone with Image Transformations enabled in the
dashboard, fronting the same bucket.

Without `imageDelivery`, the plugin falls back to serving full-size
images directly — fine for low-traffic sites, but every grid card
fetches the original.

## Configuration

```ts
media({
  // MIME types accepted by createUploadUrl. Defaults to
  // DEFAULT_ACCEPTED_TYPES (jpeg/png/gif/svg/webp/avif/pdf/doc(x)/
  // xls(x)/ppt(x)/txt/csv/md/mp3/wav/ogg/mp4/webm/mov/zip).
  acceptedTypes: ["image/jpeg", "image/png"],

  // Maximum upload size (bytes). Default: 25 MiB. Cloudflare Workers
  // free plan caps request bodies at 100 MiB; paid plans are higher.
  maxUploadSize: 10 * 1024 * 1024,
});
```

## Capabilities

Derived automatically from the `media` entry type:

| Cap                    | Min role      |
| ---------------------- | ------------- |
| `entry:media:read`     | `subscriber`  |
| `entry:media:create`   | `contributor` |
| `entry:media:edit_own` | `contributor` |
| `entry:media:edit_any` | `editor`      |
| `entry:media:delete`   | `editor`      |
| `entry:media:publish`  | `author`      |

Owners can always confirm/update/delete their own media. `delete` and
`edit_any` let editors+ act on others'.

## Upload flow

```
client → media.createUploadUrl({ filename, contentType, size })
       → server: validate, draft entry, mint upload URL
       ← { uploadUrl, headers, mediaId, storageKey, expiresAt }
            └─ presigned R2 URL    (storage.presignPut available)
            └─ /_plumix/media/upload/<id>  (worker-routed fallback)

client → PUT bytes (XHR with progress)
       ← 200/204 OK
            └─ R2:    bytes never traverse the worker
            └─ Worker: bytes streamed through env.MEDIA.put()

client → media.confirm({ id: mediaId })
       → server: read first 64 bytes, magic-byte sniff, flip to
                 published. Mismatch → object deleted + CONFLICT.
       ← { id, url, mime, size, storageKey }
```

If the PUT fails, `confirm` rejects (mime mismatch, network drop, …),
or `presignPut` itself throws after the draft row landed, both client
and server fire a best-effort `media.delete` to GC the draft.

## RPC procedures

- `media.createUploadUrl({ filename, contentType, size })` — phase 1 of
  upload. Inserts a `draft` entry, mints a presigned PUT URL.
- `media.confirm({ id })` — phase 3. Verifies bytes landed and match the
  claimed mime, flips draft → published.
- `media.list({ limit, offset })` — paginated published media + URLs +
  thumbnails (image/\* only).
- `media.update({ id, alt?, title? })` — owner OR `edit_any` writes
  alt-text / title to `meta`.
- `media.delete({ id })` — owner OR `entry:media:delete` removes the
  row + best-effort storage delete.

## Admin UI features

- Grid of cards with image thumbnails (via `imageDelivery`) or
  category glyphs for non-images.
- **Drag-and-drop** files onto the grid to upload.
- **Multi-file upload** with progress bar — concurrent uploads.
- **Inline alt-text editing** per card (blur to save).
- **Copy URL** button per card → clipboard.
- **Delete** with `window.confirm` gate.
- **Infinite scroll** — `IntersectionObserver` sentinel triggers the
  next page automatically.

## Limitations & follow-ups

The plugin doesn't (yet) ship:

- **Per-user upload quota / rate limit** — a contributor can mint
  presigned URLs as fast as they can call the RPC. Track `meta.size`
  per `authorId` or use a KV counter for at-scale deploys.
- **Server-side draft garbage collection** — drafts created by
  `createUploadUrl` get cleaned up by both client and server on the
  immediate failure paths, but a session that drops mid-flight can
  still leak a row. A scheduled handler that deletes `type=media AND
status=draft AND created_at < now-1h` would close the loop.
- **Featured image picker** — no meta box for posts to pick a featured
  image from the library. Wire it from the consuming plugin.
- **Bulk operations / search / tags** — single-row CRUD only. The
  generic `entry.*` RPCs handle search/filter for advanced cases.
- **Real worker e2e** — the plugin's e2e mocks RPC against the admin
  static dist; the playground app at
  `packages/plugins/media/playground` is the manual end-to-end rig.
