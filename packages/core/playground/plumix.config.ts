import { plumix } from "plumix";
import { anonymousPolicy, auth, authenticatedPolicy } from "plumix/auth";
import { definePlugin } from "plumix/plugin";

import { media } from "@plumix/plugin-media";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

import { theme } from "./theme.js";

// Root permalinks, so `/islands` is the `islands` page. Posts take drafts and
// revisions, for the editor's entry lifecycle.
const content = definePlugin("core-playground-content", (setup) => {
  setup.registerEntryType("page", {
    label: "Pages",
    isPublic: true,
    rewrite: { slug: "" },
  });
  setup.registerEntryType("post", {
    label: "Posts",
    supports: ["title", "editor", "revisions", "autosave"],
    isPublic: true,
    rewrite: { slug: "posts" },
  });
  // What the editor specs open: an article with a visibility policy and a topic taxonomy.
  setup.registerEntryType("article", {
    label: "Articles",
    isPublic: true,
    supports: ["title", "editor", "revisions", "autosave"],
    termTaxonomies: ["topic"],
    access: {
      default: anonymousPolicy,
      policies: [
        { key: "members", label: "Members only", policy: authenticatedPolicy },
      ],
    },
  });
  setup.registerTermTaxonomy("topic", {
    label: "Topics",
    entryTypes: ["article"],
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
