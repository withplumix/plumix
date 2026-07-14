import { blog } from "@plumix/plugin-blog";
import { comments } from "@plumix/plugin-comments";
import { media } from "@plumix/plugin-media";
import { menu } from "@plumix/plugin-menu";
import { pages } from "@plumix/plugin-pages";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  edge,
  images,
  r2,
} from "@plumix/runtime-cloudflare";
import { auth, consoleMailer, plumix } from "plumix";

import { blogTheme } from "./theme";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  // Presigned uploads, image transforms and edge cache stay dormant until
  // their env keys are attached (see each primitive's docs); until then media
  // routes through the worker and public pages render live.
  storage: r2({ binding: "MEDIA" }),
  imageDelivery: images(),
  cache: edge({ ttl: 3600, staleWhileRevalidate: 86400 }),
  mailer: consoleMailer(),
  auth: auth({
    passkey: {
      rpName: "Plumix — Blog",
      // localOrigin must be vite's dev port — the CSRF allowlist matches it,
      // not wrangler's. Swap for a hardcoded { rpId, origin } once you have a domain.
      ...cloudflareDeployOrigin({
        workerName: "plumix-blog",
        accountSubdomain: "enasyrov",
        localOrigin: "http://localhost:5173",
      }),
    },
    magicLink: { siteName: "Plumix — Blog" },
  }),
  plugins: [
    blog,
    comments({ entryTypes: ["post"] }),
    pages,
    media(),
    menu({
      locations: {
        primary: { label: "Primary" },
        footer: { label: "Footer" },
      },
    }),
  ],
  theme: blogTheme,
});
