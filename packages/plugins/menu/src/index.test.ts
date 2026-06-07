import { HookRegistry, installPlugins } from "plumix/plugin";
import { beforeEach, describe, expect, test } from "vitest";

import { menu } from "./index.js";
import {
  clearRegisteredLocations,
  getRegisteredLocations,
} from "./server/locations.js";

const ADMIN_ENTRY_PATH = "node_modules/@plumix/plugin-menu/dist/admin/index.js";

async function install() {
  return installPlugins({ hooks: new HookRegistry(), plugins: [menu()] });
}

describe("@plumix/plugin-menu", () => {
  beforeEach(() => {
    clearRegisteredLocations();
  });

  test("registers configured menu locations at setup", async () => {
    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [
        menu({
          locations: {
            primary: { label: "Primary Nav" },
            footer: { label: "Footer", description: "Below the fold" },
          },
        }),
      ],
    });
    expect(getRegisteredLocations().get("primary")).toEqual({
      id: "primary",
      label: "Primary Nav",
      description: undefined,
    });
    expect(getRegisteredLocations().get("footer")?.description).toBe(
      "Below the fold",
    );
  });

  test("each build owns the registry: a rebuild drops removed locations", async () => {
    // Dev rebuilds re-run setup in the same module lifetime — the
    // registry must reflect the latest config, not an additive union.
    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [
        menu({
          locations: {
            primary: { label: "Primary Nav" },
            footer: { label: "Footer" },
          },
        }),
      ],
    });
    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [menu({ locations: { primary: { label: "Primary Nav" } } })],
    });
    expect([...getRegisteredLocations().keys()]).toEqual(["primary"]);
  });

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

  test("registers the Menus admin page in the Appearance nav group", async () => {
    const { registry } = await install();
    const page = registry.adminPages.get("/menus");
    expect(page).toBeDefined();
    expect(page?.title).toEqual({
      id: "plugin.menu.menu.plural",
      message: "Menus",
    });
    expect(page?.capability).toBe("term:menu:manage");
    expect(page?.nav?.group).toEqual({
      id: "appearance",
      label: { id: "core.adminNav.appearance", message: "Appearance" },
      priority: 175,
    });
    expect(page?.nav?.label).toEqual({
      id: "plugin.menu.menu.plural",
      message: "Menus",
    });
    expect(page?.nav?.order).toBe(10);
    expect(page?.component).toBe("MenusShell");
  });

  test("declares the adminEntry chunk path the plumix vite plugin loads", () => {
    expect(menu().adminEntry).toBe(ADMIN_ENTRY_PATH);
  });
});
