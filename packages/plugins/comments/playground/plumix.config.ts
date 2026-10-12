import { consoleMailer, plumix } from "plumix";
import { auth } from "plumix/auth";

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
    magicLink: { siteName: "Comments playground" },
  }),
  // `plumix dev` catches mail only on a site with no mailer; a build of a
  // magic-link site needs one.
  mailer: process.env.PLUMIX_DEV ? undefined : consoleMailer(),
  plugins: [blog(), comments({ entryTypes: ["post"], rootsPerPage: 2 })],
  theme,
  i18n: { defaultLocale: "en", locales: ["en", "de"] },
  mail: {
    overrides: {
      magicLink: {
        html: (props) =>
          `<p>Comments playground</p><p><a href="${props.url}">Sign in</a></p>`,
      },
    },
  },
});
