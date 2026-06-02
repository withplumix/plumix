import type { Label } from "plumix/i18n";
import { definePlugin } from "plumix/plugin";

// Plain descriptor literals — server-side plugin code can't run the
// Babel macro pipeline, so we author the `{ id, message }` shape
// directly. The manifest payload is identical to a `defineMessage(...)`
// call (admin's chrome uses the macro freely). Translation catalogs
// for built-in plugins ship under `#697`; descriptors render as source
// text until then.
const LABELS = {
  posts: { id: "plugin.blog.post.plural", message: "Posts" },
  post: { id: "plugin.blog.post.singular", message: "Post" },
  categories: { id: "plugin.blog.category.plural", message: "Categories" },
  category: { id: "plugin.blog.category.singular", message: "Category" },
  tags: { id: "plugin.blog.tag.plural", message: "Tags" },
  tag: { id: "plugin.blog.tag.singular", message: "Tag" },
} satisfies Record<string, Label>;

export const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: LABELS.posts,
    labels: { singular: LABELS.post, plural: LABELS.posts },
    description: "Standard blog posts",
    supports: ["title", "editor", "excerpt", "revisions", "autosave"],
    versioning: { maxRevisions: 25, autosaveIntervalSeconds: 60 },
    termTaxonomies: ["category", "tag"],
    isHierarchical: false,
    isPublic: true,
    hasArchive: true,
    rewrite: { slug: "posts" },
    capabilityType: "post",
    menuIcon: "file-text",
  });

  ctx.registerTermTaxonomy("category", {
    label: LABELS.categories,
    labels: { singular: LABELS.category },
    isHierarchical: true,
    entryTypes: ["post"],
    isPublic: true,
    hasAdminColumn: true,
    rewrite: { slug: "category", isHierarchical: true },
  });

  ctx.registerTermTaxonomy("tag", {
    label: LABELS.tags,
    labels: { singular: LABELS.tag },
    isHierarchical: false,
    entryTypes: ["post"],
    isPublic: true,
    hasAdminColumn: true,
    rewrite: { slug: "tag" },
  });
});
