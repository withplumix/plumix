import { auth, defineTheme, plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { seo } from "@plumix/plugin-seo";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the SEO plugin and the blog plugin that gives it
// an entry type to hang a box off — the smallest config that dogfoods
// `@plumix/plugin-seo`. The worker-driven suite in `../e2e` boots it via
// `plumix dev --port 3090` and walks the editor's SERP preview against the
// real worker, real manifest and real plugin chunk.

const deployOrigin = cloudflareDeployOrigin({
  workerName: "plumix-seo-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The e2e harness
  // boots `plumix dev --port 3090` (see `e2e/playwright.config.ts`); override
  // here if you boot the playground manually with a different `--port`.
  localOrigin: "http://localhost:3090",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — SEO playground",
      ...deployOrigin,
    },
  }),
  plugins: [blog(), seo()],
  theme: defineTheme({ templates: () => null }),
});
