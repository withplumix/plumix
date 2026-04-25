import { blog } from "@plumix/plugin-blog";
import { pages } from "@plumix/plugin-pages";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";
import { auth, plumix } from "plumix";

// Derives `rpId` + `origin` from the Workers Builds env (`WORKERS_CI`,
// `WORKERS_CI_BRANCH`): production deploys → `<worker>.<account>.workers.dev`,
// preview deploys → `<branch>-<worker>.<account>.workers.dev`,
// local `pnpm dev` → `http://localhost:8787`. Swap to a hardcoded
// `{ rpId, origin }` once you wire a custom domain.
const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-blog",
  accountSubdomain: "enasyrov",
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Blog",
      rpId,
      origin,
    },
  }),
  plugins: [blog, pages],
});
