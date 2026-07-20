import { auth, plumix } from "plumix";

import { media } from "@plumix/plugin-media";
import { pages } from "@plumix/plugin-pages";
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
  // Media uploads (via the media plugin) land in the R2 MEDIA bucket.
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
  plugins: [pages, media()],
  // No theme registered yet, so the public site still serves plumix's built-in
  // welcome screen — the landing page theme lands with the marketing-content
  // follow-up. Pages + media are wired so content can be authored now.
});
