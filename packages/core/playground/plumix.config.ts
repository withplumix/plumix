import { plumix } from "plumix";
import { auth } from "plumix/auth";
import { definePlugin } from "plumix/plugin";

import { media } from "@plumix/plugin-media";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

import { theme } from "./theme.js";

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
  // CSRF origin-allowlist must match what the browser sends: the e2e harness
  // boots `plumix dev --port 3140`.
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
  // No `storage:`, so a seeded media row's storage key is the URL it serves
  // from, and the editor's media picker lists factory-made rows.
  plugins: [content, media()],
  theme,
});
