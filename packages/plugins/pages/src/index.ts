import { definePlugin } from "plumix/plugin";

export const pages = definePlugin("pages", (ctx) => {
  ctx.registerEntryType("page", {
    label: "Pages",
    labels: { singular: "Page", plural: "Pages" },
    description: "Hierarchical static pages",
    supports: ["title", "editor", "slug", "excerpt", "revisions", "autosave"],
    versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
    isHierarchical: true,
    isPublic: true,
    hasArchive: false,
    capabilityType: "page",
    menuIcon: "layout",
  });
});
