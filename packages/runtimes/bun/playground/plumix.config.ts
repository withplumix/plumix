import { plumix } from "plumix";
import { auth } from "plumix/auth";

import { blog } from "@plumix/plugin-blog";
import { media } from "@plumix/plugin-media";
import { bun, bunSqlite, diskStorage } from "@plumix/runtime-bun";

import { theme } from "./theme.js";

// The Bun runtime proven the way every runtime is: the shared runtime spec in
// `../e2e` boots this playground with `plumix dev` running on Bun and walks
// bootstrap → publish → public read → media upload → sign out against
// `bun:sqlite` and uploads on disk. Blog gives it a public entry type, media
// an upload.

export default plumix({
  runtime: bun(),
  database: bunSqlite({ path: "data/site.sqlite" }),
  storage: diskStorage({ dir: "data/media" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Bun playground",
      rpId: "localhost",
      // Passkeys are bound to the origin the browser sends. The e2e harness
      // boots `plumix dev --port 3130` (see `e2e/playwright.config.ts`);
      // change this too if you boot the playground manually on another port.
      origin: "http://localhost:3130",
    },
  }),
  plugins: [blog(), media()],
  theme,
});
