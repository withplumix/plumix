import { auth, plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { comments } from "@plumix/plugin-comments";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

import { theme } from "./theme.js";

// Plumix consumer wiring the comments plugin on top of blog (for the
// `post` entry type + its public permalink) — the smallest config that
// dogfoods `@plumix/plugin-comments`'s read path, and the boot target for
// the admin-queue e2e landing with #963. The read path itself is verified
// in-process via the dispatcher harness (src/render.test.ts), since public
// content renders through the worker, not the admin SPA `plumix dev` serves.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-comments-playground",
  accountSubdomain: "local",
  localOrigin: "http://localhost:3060",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Comments playground",
      rpId,
      origin,
    },
  }),
  plugins: [blog, comments({ entryTypes: ["post"] })],
  theme,
});
