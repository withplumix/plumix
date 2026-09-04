import { auth, plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { media } from "@plumix/plugin-media";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  images,
  r2,
} from "@plumix/runtime-cloudflare";

import { theme } from "./theme.js";

// The Cloudflare runtime proven the way every runtime is: the shared
// runtime spec in `../e2e` boots this playground via `plumix dev --port
// 3110` and walks bootstrap → publish → public read → media upload →
// sign out against the real worker, D1 and R2. Blog gives it a public entry
// type, media an upload.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-cloudflare-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The e2e
  // harness boots `plumix dev --port 3110` (see `e2e/playwright.config.ts`);
  // override here if you boot the playground manually with another `--port`.
  localOrigin: "http://localhost:3110",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  storage: r2({ binding: "MEDIA" }),
  imageDelivery: images(),
  auth: auth({
    passkey: {
      rpName: "Plumix — Cloudflare playground",
      rpId,
      origin,
    },
  }),
  plugins: [blog(), media()],
  theme,
});
