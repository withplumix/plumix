import { plumix } from "plumix";
import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";

import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

import { theme } from "./theme.js";

// Core's own site: no first-party plugin, one public `page` type, and a theme
// whose `page` template renders core's island fixtures by slug. The e2e suite
// in `../e2e` boots it and drives the island runtime in Chromium.

// Root permalinks, so `/islands` is the `islands` page.
const content = definePlugin("core-playground-content", (setup) => {
  setup.registerEntryType("page", {
    label: "Pages",
    isPublic: true,
    rewrite: { slug: "" },
  });
});

const deployOrigin = cloudflareDeployOrigin({
  workerName: "plumix-core-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The e2e
  // harness boots `plumix dev --port 3140` (see `e2e/playwright.config.ts`);
  // override here if you boot the playground manually with a different
  // `--port`.
  localOrigin: "http://localhost:3140",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Core playground",
      ...deployOrigin,
    },
  }),
  plugins: [content],
  theme,
});
