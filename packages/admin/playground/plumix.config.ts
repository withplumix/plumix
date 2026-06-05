import { auth, defineTheme, plumix } from "plumix";
import { definePlugin } from "plumix/plugin";

import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

// Plumix consumer for the worker-driven editor e2e in
// `packages/admin-e2e`. No published plugin — an inline plugin
// registers the one editor-enabled entry type the specs drive, plus
// two patterns (one copy-mode, one reference-mode) so the inserter,
// slash menu, starter modal, and pattern-ref detach paths all have
// real registrations to exercise.
const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-admin-e2e-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The
  // e2e harness boots `plumix dev --port 3060` (see
  // `../playwright.config.ts`); override here if you boot the
  // playground manually with a different `--port`.
  localOrigin: "http://localhost:3060",
});

const editorE2E = definePlugin("editor-e2e", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      description: "Editor e2e target type",
      supports: ["title", "editor", "excerpt", "revisions", "autosave"],
      versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
      isHierarchical: false,
      isPublic: true,
      rewrite: { slug: "posts" },
      capabilityType: "post",
      menuIcon: "file-text",
    });

    // Copy-mode pattern: the inserter splices a deep clone of the body.
    // `target: "post-content"` also makes it a starter-modal candidate.
    ctx.registerPattern({
      name: "e2e/hero",
      title: "E2E Hero",
      category: "hero",
      target: "post-content",
      entryTypes: ["post"],
      priority: 1,
      content: [
        {
          id: "p1",
          name: "core/heading",
          attrs: { level: 2, text: "Pattern heading" },
        },
        {
          id: "p2",
          name: "core/rich-text",
          attrs: { body: "<p>Pattern body copy</p>" },
        },
      ],
    });

    // Reference-mode pattern: inserts a single `core/pattern-ref` node,
    // giving the specs a real detach / copy-slug surface.
    ctx.registerPattern({
      name: "e2e/promo",
      title: "E2E Promo",
      category: "cta",
      insert: "reference",
      content: [
        {
          id: "p1",
          name: "core/heading",
          attrs: { level: 3, text: "Promo heading" },
        },
      ],
    });
  },
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Admin editor e2e playground",
      rpId,
      origin,
    },
  }),
  plugins: [editorE2E],
  theme: defineTheme({ templates: { index: () => null } }),
});
