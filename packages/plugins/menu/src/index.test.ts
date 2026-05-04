import { describe, expect, test } from "vitest";

import { HookRegistry, installPlugins } from "@plumix/core";

import { menu } from "./index.js";

async function install() {
  return installPlugins({ hooks: new HookRegistry(), plugins: [menu] });
}

describe("@plumix/plugin-menu", () => {
  test("registers the menu_item entry type as private hierarchical", async () => {
    const { registry } = await install();
    const menuItem = registry.entryTypes.get("menu_item");
    expect(menuItem).toBeDefined();
    expect(menuItem?.isPublic).toBe(false);
    expect(menuItem?.isHierarchical).toBe(true);
    expect(menuItem?.termTaxonomies).toEqual(["menu"]);
    expect(menuItem?.registeredBy).toBe("menu");
  });

  test("registers the menu taxonomy as private flat", async () => {
    const { registry } = await install();
    const taxonomy = registry.termTaxonomies.get("menu");
    expect(taxonomy).toBeDefined();
    expect(taxonomy?.isPublic).toBe(false);
    expect(taxonomy?.isHierarchical).toBe(false);
    expect(taxonomy?.entryTypes).toEqual(["menu_item"]);
    expect(taxonomy?.registeredBy).toBe("menu");
  });

  test("derives menu_item:* capabilities from the entry type", async () => {
    const { registry } = await install();
    expect(registry.capabilities.get("entry:menu_item:create")).toBeDefined();
    expect(registry.capabilities.get("entry:menu_item:edit_any")).toBeDefined();
  });
});
