import { auth, defineTheme, memoryStorage, plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { og } from "@plumix/plugin-og";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the og plugin and the blog plugin that gives it
// an entry type to hang a card off — the smallest config that dogfoods
// `@plumix/plugin-og`. The worker-driven suite in `../e2e` boots it via
// `plumix dev --port 3080` and walks the editor's card preview against the
// real worker, real manifest and real plugin chunk.

const deployOrigin = cloudflareDeployOrigin({
  workerName: "plumix-og-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The e2e harness
  // boots `plumix dev --port 3080` (see `e2e/playwright.config.ts`); override
  // here if you boot the playground manually with a different `--port`.
  localOrigin: "http://localhost:3080",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  // The preview renders live and stores nothing, so the bucket is here only
  // for the card *route* the same install serves.
  storage: memoryStorage(),
  auth: auth({
    passkey: {
      rpName: "Plumix — OG cards playground",
      ...deployOrigin,
    },
  }),
  plugins: [blog(), og({ preview: ["post"] })],
  theme: defineTheme({ templates: () => null }),
});
