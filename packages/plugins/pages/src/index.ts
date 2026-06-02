import type { MessageDescriptor } from "@lingui/core";
import { definePlugin } from "plumix/plugin";

// Plain descriptor literal: plugin definitions are evaluated server-
// side (worker / SSR) where no Babel pipeline transforms macros.
// Admin's chrome code (browser via Vite + babel preset) uses
// `defineMessage(...)` macro freely; server-side plugin code uses
// the literal form. The manifest payload is identical either way.
const PAGES_LABEL = {
  id: "plugin.pages.label",
  message: "Pages",
} satisfies MessageDescriptor;

export const pages = definePlugin("pages", {
  i18n: {
    sourceLocale: "en",
    locales: ["en", "de"],
    catalogPath: "./locales",
  },
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: PAGES_LABEL,
      labels: { singular: "Page", plural: "Pages" },
      description: "Hierarchical static pages",
      supports: ["title", "editor", "slug", "excerpt", "revisions", "autosave"],
      versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
      isHierarchical: true,
      isPublic: true,
      hasArchive: false,
      rewrite: { slug: "" },
      capabilityType: "page",
      menuIcon: "layout",
    });
  },
});
