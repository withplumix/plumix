import { auth, defineTheme, plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { feeds } from "@plumix/plugin-feeds";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer wiring only the feeds plugin and the blog it syndicates —
// the smallest config that has every feed scope in it: the site, the `post`
// type, the `category` and `tag` taxonomies, an author and a date period.
// Boot it with `pnpm dev` and read `/feed`, `/post/feed`, `/category/x/feed`,
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
