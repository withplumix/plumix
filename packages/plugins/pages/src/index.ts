import type { EntryTypeLabels } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

// Plain descriptor literals — plugin source runs server-side without
// the Babel macro pipeline. Per-entity table mirrors `blog`'s shape;
// `satisfies EntryTypeLabels` catches typo-renames at compile time.
const PAGE_LABELS = {
  singular: { id: "plugin.pages.page.singular", message: "Page" },
  plural: { id: "plugin.pages.page.plural", message: "Pages" },
  addNew: { id: "plugin.pages.page.addNew", message: "Add New" },
  addNewItem: {
    id: "plugin.pages.page.addNewItem",
    message: "Add Page",
  },
  editItem: { id: "plugin.pages.page.editItem", message: "Edit Page" },
  newItem: { id: "plugin.pages.page.newItem", message: "New Page" },
  viewItem: { id: "plugin.pages.page.viewItem", message: "View Page" },
  viewItems: { id: "plugin.pages.page.viewItems", message: "View Pages" },
  searchItems: {
    id: "plugin.pages.page.searchItems",
    message: "Search Pages…",
  },
  notFound: {
    id: "plugin.pages.page.notFound",
    message: "No pages yet",
  },
  notFoundInTrash: {
    id: "plugin.pages.page.notFoundInTrash",
    message: "Trash is empty",
  },
  allItems: { id: "plugin.pages.page.allItems", message: "All Pages" },
  noMatch: { id: "plugin.pages.page.noMatch", message: "No pages match" },
  parentItem: {
    id: "plugin.pages.page.parentItem",
    message: "Parent Page",
  },
  parentItemColon: {
    id: "plugin.pages.page.parentItemColon",
    message: "Parent Page:",
  },
  untitledItem: {
    id: "plugin.pages.page.untitledItem",
    message: "Untitled Page",
  },
  moveToTrash: {
    id: "plugin.pages.page.moveToTrash",
    message: "Move page to trash?",
  },
} satisfies EntryTypeLabels;

export const pages = definePlugin("pages", {
  i18n: {
    sourceLocale: "en",
    locales: ["en", "de"],
    catalogPath: "./locales",
  },
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: PAGE_LABELS.plural,
      labels: PAGE_LABELS,
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
