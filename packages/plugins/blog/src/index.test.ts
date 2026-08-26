import { HookRegistry, installPlugins } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import type { BlogOptions } from "./index.js";
import { blog } from "./index.js";

async function install(options: BlogOptions = {}) {
  return installPlugins({
    hooks: new HookRegistry(),
    plugins: [blog(options)],
  });
}

describe("@plumix/plugin-blog", () => {
  test("registers the post entry type with attribution", async () => {
    const { registry } = await install();
    const post = registry.entryTypes.get("post");
    expect(post).toBeDefined();
    expect(post?.label).toEqual({
      id: "plugin.blog.post.plural",
      message: "Posts",
      context: "post type general name",
    });
    expect(post?.isPublic).toBe(true);
    // No type archive: the front page is the post listing (avoids a
    // duplicate /posts route).
    expect(post?.hasArchive).toBe(false);
    expect(post?.termTaxonomies).toEqual(["category", "tag"]);
    expect(post?.registeredBy).toBe("blog");
  });

  test("serves posts under the plural /posts collection", async () => {
    const { registry } = await install();
    const post = registry.entryTypes.get("post");
    expect(post?.rewrite).toEqual({ slug: "posts" });
  });

  test("registers category as a hierarchical taxonomy with admin column", async () => {
    const { registry } = await install();
    const category = registry.termTaxonomies.get("category");
    expect(category?.isHierarchical).toBe(true);
    expect(category?.hasAdminColumn).toBe(true);
    expect(category?.entryTypes).toEqual(["post"]);
    expect(category?.rewrite).toEqual({
      slug: "category",
      isHierarchical: true,
    });
  });

  test("registers tag as a flat taxonomy", async () => {
    const { registry } = await install();
    const tag = registry.termTaxonomies.get("tag");
    expect(tag?.isHierarchical).toBe(false);
    expect(tag?.rewrite).toEqual({ slug: "tag" });
  });

  test("derives post:* capabilities from the entry type", async () => {
    const { registry } = await install();
    expect(registry.capabilities.get("entry:post:create")?.minRole).toBe(
      "contributor",
    );
    expect(registry.capabilities.get("entry:post:publish")?.minRole).toBe(
      "author",
    );
    expect(registry.capabilities.get("entry:post:edit_any")?.minRole).toBe(
      "editor",
    );
  });

  test("derives term:category:* and term:tag:* capabilities", async () => {
    const { registry } = await install();
    expect(registry.capabilities.get("term:category:assign")?.minRole).toBe(
      "contributor",
    );
    expect(registry.capabilities.get("term:category:manage")?.minRole).toBe(
      "editor",
    );
    expect(registry.capabilities.get("term:tag:assign")?.minRole).toBe(
      "contributor",
    );
  });
});

describe("post overrides", () => {
  test("moves the post type off /posts and gives it an archive", async () => {
    const { registry } = await install({
      post: {
        rewrite: { slug: "insights" },
        hasArchive: true,
        archivePerPage: 4,
      },
    });
    const post = registry.entryTypes.get("post");
    expect(post?.rewrite).toEqual({ slug: "insights" });
    expect(post?.hasArchive).toBe(true);
    expect(post?.archivePerPage).toBe(4);
  });

  test("overriding one label keeps the rest of the table", async () => {
    const { registry } = await install({
      post: {
        labels: {
          singular: { id: "site.insight.singular", message: "Insight" },
        },
      },
    });
    const labels = registry.entryTypes.get("post")?.labels;
    expect(labels?.singular).toEqual({
      id: "site.insight.singular",
      message: "Insight",
    });
    // Untouched keys survive the merge.
    expect(labels?.editItem).toEqual({
      id: "plugin.blog.post.editItem",
      message: "Edit Post",
    });
  });

  test("fields the site never mentions keep the plugin's defaults", async () => {
    const { registry } = await install({
      post: { rewrite: { slug: "insights" } },
    });
    const post = registry.entryTypes.get("post");
    expect(post?.supports).toEqual([
      "title",
      "editor",
      "excerpt",
      "revisions",
      "autosave",
    ]);
    expect(post?.capabilityType).toBe("post");
  });

  test("array fields replace by default", async () => {
    const { registry } = await install({
      post: { supports: ["title", "editor"] },
    });
    expect(registry.entryTypes.get("post")?.supports).toEqual([
      "title",
      "editor",
    ]);
  });

  test("array fields compose via (prev) => next", async () => {
    const { registry } = await install({
      post: { supports: (prev) => prev.filter((s) => s !== "revisions") },
    });
    expect(registry.entryTypes.get("post")?.supports).toEqual([
      "title",
      "editor",
      "excerpt",
      "autosave",
    ]);
  });
});

describe("taxonomy overrides", () => {
  test("moves a taxonomy's archive base", async () => {
    const { registry } = await install({
      category: { rewrite: { slug: "topics", isHierarchical: true } },
    });
    expect(registry.termTaxonomies.get("category")?.rewrite).toEqual({
      slug: "topics",
      isHierarchical: true,
    });
  });

  test("`false` skips the registration entirely", async () => {
    const { registry } = await install({ tag: false });
    expect(registry.termTaxonomies.get("tag")).toBeUndefined();
    expect(registry.termTaxonomies.get("category")).toBeDefined();
  });

  test("a skipped taxonomy also leaves the post type's termTaxonomies", async () => {
    // Otherwise `post` advertises a taxonomy that was never registered.
    const { registry } = await install({ tag: false });
    expect(registry.entryTypes.get("post")?.termTaxonomies).toEqual([
      "category",
    ]);
  });

  test("an explicit termTaxonomies override still wins over pruning", async () => {
    const { registry } = await install({
      tag: false,
      post: { termTaxonomies: ["category", "series"] },
    });
    expect(registry.entryTypes.get("post")?.termTaxonomies).toEqual([
      "category",
      "series",
    ]);
  });

  test("`post: false` skips the entry type", async () => {
    const { registry } = await install({ post: false });
    expect(registry.entryTypes.get("post")).toBeUndefined();
  });
});

describe("relatedPosts", () => {
  test("registers the template dep by default", async () => {
    const { registry } = await install();
    expect(registry.templateDeps.get("relatedPosts")).toBeDefined();
  });

  test("`false` skips it", async () => {
    const { registry } = await install({ relatedPosts: false });
    expect(registry.templateDeps.get("relatedPosts")).toBeUndefined();
  });
});
