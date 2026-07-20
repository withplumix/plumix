import { auth, plumix } from "plumix";

import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  r2,
} from "@plumix/runtime-cloudflare";

export default plumix({
  runtime: cloudflare(),
  // session: "auto" routes writes to primary, nearest replica for anon reads,
  // and resumes authenticated reads from a bookmark cookie for read-your-writes.
  database: d1({ binding: "DB", session: "auto" }),
  // Media uploads land in R2. Dormant until the marketing-content follow-up
  // wires a theme/media that actually stores images.
  storage: r2({ binding: "MEDIA" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Marketing",
      // Placeholder deploy origin — set a real workerName/accountSubdomain when
      // the marketing-content follow-up wires deployment. localOrigin must be
      // vite's dev port; the CSRF allowlist matches it, not wrangler's.
      ...cloudflareDeployOrigin({
        workerName: "plumix-marketing",
        accountSubdomain: "your-account",
        localOrigin: "http://localhost:5173",
      }),
    },
  }),
  // Scaffold: no theme or content plugins yet, so the public site serves
  // plumix's built-in welcome screen. The real landing page — a theme plus the
  // `pages` plugin — lands with the marketing-content follow-up.
});
