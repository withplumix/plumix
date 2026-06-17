import { blog } from "@plumix/plugin-blog";
import { comments } from "@plumix/plugin-comments";
import { media } from "@plumix/plugin-media";
import { menu } from "@plumix/plugin-menu";
import { pages } from "@plumix/plugin-pages";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  edge,
  images,
  r2,
} from "@plumix/runtime-cloudflare";
import { auth, consoleMailer, plumix } from "plumix";

import { blogTheme } from "./theme";

// Derives `rpId` + `origin` from the Workers Builds env (`WORKERS_CI`,
// `WORKERS_CI_BRANCH`): production deploys → `<worker>.<account>.workers.dev`,
// preview deploys → `<branch>-<worker>.<account>.workers.dev`,
// local `pnpm dev` → `localOrigin`. The CSRF origin-allowlist must
// match what the browser sends: `plumix dev` serves on vite's port
// (5173 by default), NOT wrangler's 8787 — without the override every
// /_plumix POST 403s and the admin can't even log in. Swap to a
// hardcoded `{ rpId, origin }` once you wire a custom domain.
const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-blog",
  accountSubdomain: "enasyrov",
  localOrigin: "http://localhost:5173",
});

// Media R2 + image-delivery wiring is opt-in via env. With S3
// credentials (CF_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY +
// MEDIA_BUCKET), uploads bypass the worker via presigned PUTs straight
// to R2. Without them, `media.createUploadUrl` returns a worker-routed
// URL and bytes flow through `env.MEDIA.put` via the binding — slower
// at scale but works the moment the bucket binding is attached. Set
// MEDIA_PUBLIC_URL_BASE to a CF zone with Image Transformations enabled
// for thumbnails on the fly.
const s3 = resolveR2S3Credentials();

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  storage: r2({
    binding: "MEDIA",
    publicUrlBase: process.env.MEDIA_PUBLIC_URL_BASE,
    s3,
  }),
  imageDelivery: process.env.MEDIA_PUBLIC_URL_BASE
    ? images({ zone: process.env.MEDIA_PUBLIC_URL_BASE })
    : undefined,
  // Edge cache for anonymous public pages. Dormant until the deploy has a
  // custom-domain zone: `edge()` reads `CF_ZONE_ID` + `CF_CACHE_PURGE_TOKEN`
  // from the worker env and renders live (no caching) when either is absent,
  // so this is a no-op on `*.workers.dev`. Attach a domain, then
  // `wrangler secret put CF_ZONE_ID` / `CF_CACHE_PURGE_TOKEN` (an API token
  // with the Zone · Cache Purge permission) to activate — no code change.
  cache: edge({ ttl: 3600, staleWhileRevalidate: 86400 }),
  // Outbound email transport. Top-level so every feature that sends
  // mail (magic-link today; future invite-email, notifications, plugin
  // emails) reuses the same instance — operators wire one transport,
  // it's available repo-wide via `ctx.mailer`. The default
  // `consoleMailer()` logs the message; production swaps in any
  // `Mailer` (one method):
  //
  //   const mailer = {
  //     async send(message) {
  //       await fetch("https://api.resend.com/emails", {
  //         method: "POST",
  //         headers: {
  //           Authorization: `Bearer ${env.RESEND_API_KEY}`,
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify({
  //           from: "noreply@plumix.test",
  //           ...message,
  //         }),
  //       });
  //     },
  //   };
  mailer: consoleMailer(),
  auth: auth({
    passkey: {
      rpName: "Plumix — Blog",
      rpId,
      origin,
    },
    // Magic-link sign-in + signup (allowed-domain gated). The transport
    // is the top-level `mailer` above; siteName is the user-visible
    // string in the email subject + body.
    magicLink: { siteName: "Plumix — Blog" },
  }),
  plugins: [
    blog,
    comments({ entryTypes: ["post"] }),
    pages,
    media(),
    menu({
      locations: {
        primary: { label: "Primary" },
        footer: { label: "Footer" },
      },
    }),
  ],
  theme: blogTheme,
});

function resolveR2S3Credentials():
  | {
      readonly bucket: string;
      readonly accountId: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
    }
  | undefined {
  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.MEDIA_BUCKET;
  if (
    accountId !== undefined &&
    accessKeyId !== undefined &&
    secretAccessKey !== undefined &&
    bucket !== undefined
  ) {
    return { accountId, accessKeyId, secretAccessKey, bucket };
  }
  if (
    accountId === undefined &&
    accessKeyId === undefined &&
    secretAccessKey === undefined &&
    bucket === undefined
  ) {
    return undefined;
  }
  throw new Error(
    "blog example: partial R2 S3 credentials. Set all of CF_ACCOUNT_ID, " +
      "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, MEDIA_BUCKET (or none).",
  );
}
