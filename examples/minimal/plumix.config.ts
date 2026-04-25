import { auth, plumix } from "plumix";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Derives `rpId` + `origin` from the Workers Builds env (`WORKERS_CI`,
// `WORKERS_CI_BRANCH`): production deploys → `<worker>.<account>.workers.dev`,
// preview deploys → `<branch>-<worker>.<account>.workers.dev`,
// local `pnpm dev` → `http://localhost:8787`. Swap to a hardcoded
// `{ rpId, origin }` once you wire a custom domain.
const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-minimal",
  accountSubdomain: "enasyrov",
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
});
