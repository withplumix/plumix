import type { EntryTypeLabels, TermTaxonomyLabels } from "plumix/plugin";
import { withContext } from "plumix/i18n";
import { definePlugin } from "plumix/plugin";

// Plain descriptor literals — server-side plugin code can't run the
// Babel macro pipeline, so we author the `{ id, message }` shape
// directly. The manifest payload is identical to a `defineMessage(...)`
// call (admin's chrome uses the macro freely). Per-entity tables let
// the registration sites collapse to `labels: POST_LABELS` instead of
// hand-forwarding every key — and `satisfies EntryTypeLabels` /
// `TermTaxonomyLabels` enforces compile-time coverage of the cascade
// schema so typo-renames silently falling through to the generic
// fallback aren't possible.

// Singular/plural carry WP `_x()` contexts so verb-shaped reuses
// (`Post a comment`, `Draft this`) can diverge in translation.
// The matching `msgctxt` lines in `locales/en.po` are hand-authored —
// see the `X-Generator: hand-authored` header. `withContext` is not
// macro-visible, so any future `lingui extract` integration here would
// regress those lines silently.
//
// Action-phrase labels (`Add Post`, `Edit Tag`) intentionally OMIT
// context — the leading English verb fixes the polyseme as a noun in
// every target locale, matching WP gettext convention (only the
// standalone singular/plural carry `_x()`).
const POST_LABELS = {
  singular: withContext(
    { id: "plugin.blog.post.singular", message: "Post" },
    "post type singular name",
  ),
  plural: withContext(
    { id: "plugin.blog.post.plural", message: "Posts" },
    "post type general name",
  ),
  addNewItem: { id: "plugin.blog.post.addNewItem", message: "Add Post" },
  editItem: { id: "plugin.blog.post.editItem", message: "Edit Post" },
  newItem: { id: "plugin.blog.post.newItem", message: "New Post" },
  viewItem: { id: "plugin.blog.post.viewItem", message: "View Post" },
  searchItems: {
    id: "plugin.blog.post.searchItems",
    message: "Search Posts…",
  },
  notFound: { id: "plugin.blog.post.notFound", message: "No posts yet" },
  notFoundInTrash: {
    id: "plugin.blog.post.notFoundInTrash",
    message: "Trash is empty",
  },
  allItems: { id: "plugin.blog.post.allItems", message: "All Posts" },
  noMatch: { id: "plugin.blog.post.noMatch", message: "No posts match" },
  untitledItem: {
    id: "plugin.blog.post.untitledItem",
    message: "Untitled Post",
  },
  moveToTrash: {
    id: "plugin.blog.post.moveToTrash",
    message: "Move post to trash?",
  },
} satisfies EntryTypeLabels;

const CATEGORY_LABELS = {
  singular: withContext(
    { id: "plugin.blog.category.singular", message: "Category" },
    "taxonomy singular name",
  ),
  addNewItem: {
    id: "plugin.blog.category.addNewItem",
    message: "Add Category",
  },
  editItem: {
    id: "plugin.blog.category.editItem",
    message: "Edit Category",
  },
  searchItems: {
    id: "plugin.blog.category.searchItems",
    message: "Search Categories…",
  },
  notFound: {
    id: "plugin.blog.category.notFound",
    message: "No categories yet",
  },
  allItems: {
    id: "plugin.blog.category.allItems",
    message: "All Categories",
  },
  parentItem: {
    id: "plugin.blog.category.parentItem",
    message: "Parent Category",
  },
  backToItems: {
    id: "plugin.blog.category.backToItems",
    message: "← Back to Categories",
  },
} satisfies TermTaxonomyLabels;

const TAG_LABELS = {
  singular: withContext(
    { id: "plugin.blog.tag.singular", message: "Tag" },
    "taxonomy singular name",
  ),
  addNewItem: { id: "plugin.blog.tag.addNewItem", message: "Add Tag" },
  editItem: { id: "plugin.blog.tag.editItem", message: "Edit Tag" },
  searchItems: {
    id: "plugin.blog.tag.searchItems",
    message: "Search Tags…",
  },
  notFound: { id: "plugin.blog.tag.notFound", message: "No tags yet" },
  allItems: { id: "plugin.blog.tag.allItems", message: "All Tags" },
  backToItems: {
    id: "plugin.blog.tag.backToItems",
    message: "← Back to Tags",
  },
} satisfies TermTaxonomyLabels;

// Plural for the term-taxonomy root `label` field — `TermTaxonomyLabels`
// doesn't include `plural` (taxonomies only carry singular on the
// labels table), so the plural lives alongside the table.
const CATEGORY_PLURAL = withContext(
  { id: "plugin.blog.category.plural", message: "Categories" },
  "taxonomy general name",
);
const TAG_PLURAL = withContext(
  { id: "plugin.blog.tag.plural", message: "Tags" },
  "taxonomy general name",
);

export const blog = definePlugin("blog", {
  i18n: {
    sourceLocale: "en",
    locales: ["en"],
    catalogPath: "./locales",
  },
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: POST_LABELS.plural,
      labels: POST_LABELS,
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
      keywords: ["articles", "blog", "writing", "news"],
    });

    ctx.registerTermTaxonomy("category", {
      label: CATEGORY_PLURAL,
      labels: CATEGORY_LABELS,
      isHierarchical: true,
      entryTypes: ["post"],
      isPublic: true,
      hasAdminColumn: true,
      rewrite: { slug: "category", isHierarchical: true },
      keywords: ["taxonomy", "categories"],
    });

    ctx.registerTermTaxonomy("tag", {
      label: TAG_PLURAL,
      labels: TAG_LABELS,
      isHierarchical: false,
      entryTypes: ["post"],
      isPublic: true,
      hasAdminColumn: true,
      rewrite: { slug: "tag" },
      keywords: ["taxonomy", "tags"],
    });
  },
});
