import { auth, plumix } from "plumix";
import { defineTheme } from "plumix/theme";

import { menu } from "@plumix/plugin-menu";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Minimal theme that registers menu locations. Without a theme the
// menu plugin's locations list is empty, so the worker-driven e2e
// can't exercise the location-assignment flow. Themes are the
// canonical surface that ships menu locations to admin authors.
const playgroundTheme = defineTheme({
  id: "menu-playground-theme",
  setup: (themeCtx) => {
    themeCtx.registerMenuLocation("primary", { label: "Primary Nav" });
    themeCtx.registerMenuLocation("footer", { label: "Footer" });
  },
});

// Plumix consumer wiring only the menu plugin — the smallest config
// you can run to dogfood `@plumix/plugin-menu` without bringing the
// rest of the plumix surface (blog, pages, media, etc.) along. The
// worker-driven plugin e2e suite in `../e2e` boots this playground via
// `plumix dev` and walks the menu happy path against the real worker.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-menu-playground",
  accountSubdomain: "local",
  // `plumix dev` binds the worker to vite's port (5173); the CSRF
  // origin-allowlist must match what the browser actually sends.
  // Default would be 8787 (wrangler dev), which mismatches and 403s
  // every POST.
  localOrigin: "http://localhost:5173",
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
  themes: [playgroundTheme],
  plugins: [menu],
});
