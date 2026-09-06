import type { EntryData } from "plumix";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import {
  auth,
  defineTemplate,
  defineTheme,
  entry,
  fallback,
  frontPage,
  plumix,
} from "plumix";

import { blog } from "@plumix/plugin-blog";
import { media } from "@plumix/plugin-media";
import { diskStorage, node, nodeSqlite } from "@plumix/runtime-node";

// The playground `../e2e` runs the shared runtime spec against: blog gives it
// a public entry type, media an upload.
//
// The theme lives here rather than in a file beside the config, as it does on
// Cloudflare, because the config-edit case rewrites the marker below while
// the server runs — the edit has to land in the config file itself for that
// case to prove what it claims.

// Rewritten in place by the config-edit case; keep it a lone string literal.
const FRONT_PAGE_MARKER = "config-edit-baseline";

// Authored with `createElement` (no JSX) so the theme stays
// transform-agnostic across the jiti config load and the vite server bundle.
const single = defineTemplate<EntryData>({
  render: ({ data }): ReactNode =>
    h("main", null, h("h1", { "data-testid": "post-title" }, data.entry.title)),
});

const front = defineTemplate({
  render: (): ReactNode =>
    h(
      "main",
      null,
      h("p", { "data-testid": "config-marker" }, FRONT_PAGE_MARKER),
    ),
});

export default plumix({
  runtime: node(),
  database: nodeSqlite({ path: "data/site.sqlite" }),
  storage: diskStorage({ dir: "data/media" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Node playground",
      rpId: "localhost",
      // Passkeys are bound to the origin the browser sends. The e2e harness
      // boots `plumix dev --port 3120` (see `e2e/playwright.config.ts`);
      // change this too if you boot the playground manually on another port.
      origin: "http://localhost:3120",
    },
  }),
  plugins: [blog(), media()],
  theme: defineTheme({
    templates: [fallback(() => null), entry(single), frontPage(front)],
  }),
});
