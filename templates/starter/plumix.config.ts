import { blog } from "@plumix/plugin-blog";
import { pages } from "@plumix/plugin-pages";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";
import { auth, consoleMailer, plumix } from "plumix";

// Derives `rpId` + `origin` from the Workers Builds env (`WORKERS_CI`,
// `WORKERS_CI_BRANCH`): production deploys → `<worker>.<account>.workers.dev`,
// preview deploys → `<branch>-<worker>.<account>.workers.dev`,
// local `pnpm dev` → `http://localhost:8787`. Swap to a hardcoded
// `{ rpId, origin }` once you wire a custom domain.
const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-starter",
  // Replace with your Cloudflare account's workers.dev subdomain
  // (the bit before `.workers.dev` on your account's default route).
  accountSubdomain: "<replace-with-your-cloudflare-account-subdomain>",
});

export default plumix({
  runtime: cloudflare(),
  // `session: "auto"` routes writes to primary, anon reads to the nearest
  // replica, and resumes authenticated reads from a bookmark cookie for
  // read-your-writes consistency. Drop the option to stay primary-only.
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix Starter",
      rpId,
      origin,
    },
  }),
  // `consoleMailer()` logs outgoing mail bodies to the worker logs —
  // fine for development, swap in an SES/Postmark/etc. transport
  // before production. Pre-wired here so email-change flows (and
  // magic-link if you enable it later) work out of the box.
  mailer: consoleMailer(),
  plugins: [blog, pages],
});
