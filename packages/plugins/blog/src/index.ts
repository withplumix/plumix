import { definePlugin } from "plumix/plugin";

export const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    labels: { singular: "Post", plural: "Posts" },
    description: "Standard blog posts",
    supports: ["title", "editor", "excerpt"],
    termTaxonomies: ["category", "tag"],
    isHierarchical: false,
    isPublic: true,
    hasArchive: true,
    capabilityType: "post",
    menuIcon: "file-text",
  });

  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    labels: { singular: "Category" },
    isHierarchical: true,
    entryTypes: ["post"],
    isPublic: true,
    hasAdminColumn: true,
    rewrite: { slug: "category", isHierarchical: true },
  });

  ctx.registerTermTaxonomy("tag", {
    label: "Tags",
    labels: { singular: "Tag" },
    isHierarchical: false,
    entryTypes: ["post"],
    isPublic: true,
    hasAdminColumn: true,
    rewrite: { slug: "tag" },
  });
});
