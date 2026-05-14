import { auth, plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the blog plugin — the smallest config
// you can run to dogfood `@plumix/plugin-blog` without bringing the
// rest of the plumix surface (menu, media, audit-log, etc.) along.
// The worker-driven plugin e2e suite in `../e2e` boots this playground
// via `plumix dev --port 3020` and walks the blog happy path against
// the real worker.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-blog-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The
  // e2e harness boots `plumix dev --port 3020` (see
  // `e2e/playwright.config.ts`); override here if you boot the
  // playground manually with a different `--port`.
  localOrigin: "http://localhost:3020",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Blog playground",
      rpId,
      origin,
    },
  }),
  plugins: [blog],
});
