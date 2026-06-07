import { auth, defineTheme, plumix } from "plumix";

import { menu } from "@plumix/plugin-menu";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the menu plugin — the smallest config
// you can run to dogfood `@plumix/plugin-menu` without bringing the
// rest of the plumix surface (blog, pages, media, etc.) along. The
// worker-driven plugin e2e suite in `../e2e` boots this playground via
// `plumix dev` and walks the menu happy path against the real worker.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-menu-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser actually sends.
  // The e2e harness boots `plumix dev --port 3040` (see
  // `e2e/playwright.config.ts`), so this matches that port. If you
  // boot the playground manually with a different `--port`, override
  // this constant accordingly.
  localOrigin: "http://localhost:3040",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Menu playground",
      rpId,
      origin,
    },
  }),
  // Locations are nav slots the theme renders; the e2e locations-tab
  // canary assigns the Primary menu into "primary".
  plugins: [
    menu({
      locations: {
        primary: { label: "Primary Nav" },
        footer: { label: "Footer" },
      },
    }),
  ],
  theme: defineTheme({ templates: { index: () => null } }),
});
