import { auth, plumix } from "plumix";

import { auditLog } from "@plumix/plugin-audit-log";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the audit-log plugin — the smallest
// config you can run to dogfood `@plumix/plugin-audit-log` without
// bringing the rest of the plumix surface (blog, pages, etc.) along.
// The worker-driven plugin e2e suite in `../e2e` boots this playground
// via `plumix dev` and walks the audit-log happy path against the real
// worker.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-audit-log-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The
  // e2e harness boots `plumix dev --port 3010` (see
  // `e2e/playwright.config.ts`); override here if you boot the
  // playground manually with a different `--port`.
  localOrigin: "http://localhost:3010",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Audit log playground",
      rpId,
      origin,
    },
  }),
  plugins: [auditLog()],
});
