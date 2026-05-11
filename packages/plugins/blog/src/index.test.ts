import { HookRegistry, installPlugins } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { blog } from "./index.js";

async function install() {
  return installPlugins({ hooks: new HookRegistry(), plugins: [blog] });
}

describe("@plumix/plugin-blog", () => {
  test("registers the post entry type with attribution", async () => {
    const { registry } = await install();
    const post = registry.entryTypes.get("post");
    expect(post).toBeDefined();
    expect(post?.label).toBe("Posts");
    expect(post?.isPublic).toBe(true);
    expect(post?.hasArchive).toBe(true);
    expect(post?.termTaxonomies).toEqual(["category", "tag"]);
    expect(post?.registeredBy).toBe("blog");
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
