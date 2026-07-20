import { auth, defineTheme, plumix } from "plumix";

import { media } from "@plumix/plugin-media";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  images,
  r2,
} from "@plumix/runtime-cloudflare";

// Smallest config that dogfoods `@plumix/plugin-media` in isolation. `pnpm dev`
// here, then open /_plumix/admin. Presigned R2 uploads need the S3 keys in
// `.dev.vars` (see `r2`'s docs); without them uploads route through the worker.

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  storage: r2({ binding: "MEDIA" }),
  imageDelivery: images(),
  auth: auth({
    passkey: {
      rpName: "Plumix — Media playground",
      // CSRF origin-allowlist must match what the browser sends. The e2e
      // harness boots `plumix dev --port 3030` (see `e2e/playwright.config.ts`);
      // override `localOrigin` if you boot the playground on a different port.
      ...cloudflareDeployOrigin({
        workerName: "plumix-media-playground",
        accountSubdomain: "local",
        localOrigin: "http://localhost:3030",
      }),
    },
  }),
  plugins: [media()],
  theme: defineTheme({ templates: () => null }),
});
