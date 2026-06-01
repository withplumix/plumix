import { HookRegistry, installPlugins } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { pages } from "./index.js";

async function install() {
  return installPlugins({ hooks: new HookRegistry(), plugins: [pages] });
}

describe("@plumix/plugin-pages", () => {
  test("registers the page entry type with attribution", async () => {
    const { registry } = await install();
    const page = registry.entryTypes.get("page");
    expect(page).toBeDefined();
    // Label is a `MessageDescriptor` (slice 5 #674): plugins ship
    // descriptors so admin can resolve the translated string at render.
    expect(page?.label).toEqual({
      id: "plugin.pages.label",
      message: "Pages",
    });
    expect(page?.isHierarchical).toBe(true);
    expect(page?.isPublic).toBe(true);
    expect(page?.hasArchive).toBe(false);
    expect(page?.registeredBy).toBe("pages");
  });

  test("serves pages at the URL root via empty rewrite.slug", async () => {
    const { registry } = await install();
    const page = registry.entryTypes.get("page");
    expect(page?.rewrite).toEqual({ slug: "" });
  });

  test("registers no taxonomies", async () => {
    const { registry } = await install();
    expect(registry.termTaxonomies.size).toBe(0);
  });

  test("derives page:* capabilities from the entry type", async () => {
    const { registry } = await install();
    expect(registry.capabilities.get("entry:page:create")?.minRole).toBe(
      "contributor",
    );
    expect(registry.capabilities.get("entry:page:publish")?.minRole).toBe(
      "author",
    );
    expect(registry.capabilities.get("entry:page:edit_any")?.minRole).toBe(
      "editor",
    );
  });
});
