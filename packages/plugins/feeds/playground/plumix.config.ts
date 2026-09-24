import { plumix } from "plumix";
import { auth } from "plumix/auth";
import { defineTheme } from "plumix/theme";

import { blog } from "@plumix/plugin-blog";
import { feeds } from "@plumix/plugin-feeds";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the feeds plugin and the blog it syndicates —
// the smallest config with a feed beside most kinds of archive: the front
// page, the `category` and `tag` taxonomies, an author and a date period. The
// blog's `post` type has no archive page, so it has no feed of its own.
// Boot it with `pnpm dev` and read `/feed`, `/category/x/feed`,
// `/authors/x/feed`, `/2026/07/feed` and the `/atom` variant of each.

const deployOrigin = cloudflareDeployOrigin({
  workerName: "plumix-feeds-playground",
  accountSubdomain: "local",
  localOrigin: "http://localhost:3090",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Feeds playground",
      ...deployOrigin,
    },
  }),
  plugins: [blog(), feeds()],
  theme: defineTheme({ templates: () => null }),
});
