import type { Label } from "plumix/i18n";
import { definePlugin } from "plumix/plugin";

// Plain descriptor literals: plugin definitions evaluate server-side
// (worker / SSR) where no Babel pipeline transforms macros. Admin's
// chrome code (browser via Vite + babel preset) uses `defineMessage(...)`
// freely; server-side plugin code authors `{ id, message }` directly.
// The manifest payload is identical either way.
const LABELS = {
  pages: { id: "plugin.pages.label", message: "Pages" },
  page: { id: "plugin.pages.singular", message: "Page" },
} satisfies Record<string, Label>;

export const pages = definePlugin("pages", {
  i18n: {
    sourceLocale: "en",
    locales: ["en", "de"],
    catalogPath: "./locales",
  },
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: LABELS.pages,
      labels: { singular: LABELS.page, plural: LABELS.pages },
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
