import { auth, plumix } from "plumix";

import { pages } from "@plumix/plugin-pages";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the pages plugin — the smallest config
// you can run to dogfood `@plumix/plugin-pages` without bringing the
// rest of the plumix surface (blog, menu, media, audit-log, etc.)
// along. The worker-driven plugin e2e suite in `../e2e` boots this
// playground via `plumix dev --port 3050` and walks the pages happy
// path against the real worker.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-pages-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The
  // e2e harness boots `plumix dev --port 3050` (see
  // `e2e/playwright.config.ts`); override here if you boot the
  // playground manually with a different `--port`.
  localOrigin: "http://localhost:3050",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Pages playground",
      rpId,
      origin,
    },
  }),
  plugins: [pages],
});
