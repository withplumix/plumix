import { auth, plumix } from "plumix";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Derives `rpId` + `origin` from the Workers Builds env (`WORKERS_CI`,
// `WORKERS_CI_BRANCH`): production deploys → `<worker>.<account>.workers.dev`,
// preview deploys → `<branch>-<worker>.<account>.workers.dev`,
// local `pnpm dev` → `localOrigin`. The CSRF origin-allowlist must
// match what the browser sends: `plumix dev` serves on vite's port
// (5173 by default), NOT wrangler's 8787 — without the override every
// /_plumix POST 403s and the admin can't even log in. Swap to a
// hardcoded `{ rpId, origin }` once you wire a custom domain.
const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-minimal",
  accountSubdomain: "enasyrov",
  localOrigin: "http://localhost:5173",
});

export default plumix({
  runtime: cloudflare(),
  // session: "auto" routes writes to primary, nearest replica for anon reads,
  // and resumes authenticated reads from a bookmark cookie for read-your-writes.
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Minimal",
      rpId,
      origin,
    },
  }),
  // No theme registered: the public site serves plumix's built-in welcome
  // screen. Add a `theme` once you start rendering your own public routes.
});
