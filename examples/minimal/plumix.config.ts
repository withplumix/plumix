import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";
import { auth, plumix } from "plumix";

export default plumix({
  runtime: cloudflare(),
  // session: "auto" routes writes to primary, nearest replica for anon reads,
  // and resumes authenticated reads from a bookmark cookie for read-your-writes.
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Minimal",
      // localOrigin must be vite's dev port — the CSRF allowlist matches it,
      // not wrangler's. Swap for a hardcoded { rpId, origin } once you have a domain.
      ...cloudflareDeployOrigin({
        workerName: "plumix-minimal",
        accountSubdomain: "enasyrov",
        localOrigin: "http://localhost:5173",
      }),
    },
  }),
  // No theme registered: the public site serves plumix's built-in welcome
  // screen. Add a `theme` once you start rendering your own public routes.
});
