import { definePlugin } from "@plumix/core";

export const pages = definePlugin("pages", (ctx) => {
  ctx.registerEntryType("page", {
    label: "Pages",
    labels: { singular: "Page", plural: "Pages" },
    description: "Hierarchical static pages",
    supports: ["title", "editor", "slug", "excerpt"],
    isHierarchical: true,
    isPublic: true,
    hasArchive: false,
    capabilityType: "page",
    menuIcon: "layout",
  });
});
