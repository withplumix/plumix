import { describe, expect, test } from "vitest";

import type { CoreCapability } from "./rbac.js";
import { deriveEntryTypeCapabilities } from "../access/contract/rbac.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredEntryType } from "../plugin/registry.js";
import {
  capabilitiesForRole,
  CORE_CAPABILITIES,
  createCapabilityResolver,
} from "./rbac.js";

describe("createCapabilityResolver", () => {
  const emptyRegistry = createPluginRegistry();

  test("grants core capability when role meets the minimum", () => {
    const resolver = createCapabilityResolver(emptyRegistry);
    expect(resolver.hasCapability("author", "entry:post:publish")).toBe(true);
    expect(resolver.hasCapability("editor", "entry:post:publish")).toBe(true);
    expect(resolver.hasCapability("admin", "entry:post:publish")).toBe(true);
  });

  test("denies core capability when role is below minimum", () => {
    const resolver = createCapabilityResolver(emptyRegistry);
    expect(resolver.hasCapability("contributor", "entry:post:publish")).toBe(
      false,
    );
    expect(resolver.hasCapability("subscriber", "entry:post:edit_any")).toBe(
      false,
    );
  });

  test("returns false for unknown capability (no implicit grant)", () => {
    const resolver = createCapabilityResolver(emptyRegistry);
    expect(resolver.hasCapability("admin", "nope:nothing")).toBe(false);
    expect(resolver.requiredRole("nope:nothing")).toBeNull();
  });

  test("requiredRole names a core capability's minimum role", () => {
    const resolver = createCapabilityResolver(emptyRegistry);
    expect(resolver.requiredRole("entry:post:publish")).toBe("author");
  });

  test("plugin-registered capabilities are looked up alongside core", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("seo:manage", {
      name: "seo:manage",
      grantTo: ["editor", "admin"],
      registeredBy: "seo",
    });
    const resolver = createCapabilityResolver(registry);
    expect(resolver.hasCapability("editor", "seo:manage")).toBe(true);
    expect(resolver.hasCapability("author", "seo:manage")).toBe(false);
  });

  test("plugin capability overrides core (last-write-wins on lookup)", () => {
    const registry = createPluginRegistry();
    // Simulate a plugin tightening `post:delete` from editor to admin.
    registry.capabilities.set("entry:post:delete", {
      name: "entry:post:delete",
      grantTo: ["admin"],
      registeredBy: "strict",
    });
    const resolver = createCapabilityResolver(registry);
    expect(resolver.hasCapability("editor", "entry:post:delete")).toBe(false);
    expect(resolver.hasCapability("admin", "entry:post:delete")).toBe(true);
  });

  test("post-type-derived caps resolve for their registered roles", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("entry:landing_page:publish", {
      name: "entry:landing_page:publish",
      grantTo: ["author", "editor", "admin"],
      registeredBy: "blog",
    });
    const resolver = createCapabilityResolver(registry);
    expect(
      resolver.hasCapability("contributor", "entry:landing_page:publish"),
    ).toBe(false);
    expect(resolver.hasCapability("author", "entry:landing_page:publish")).toBe(
      true,
    );
  });
});

describe("CORE_CAPABILITIES baseline", () => {
  test("covers the capability names used by first-party surfaces", () => {
    for (const name of [
      "entry:post:read",
      "entry:post:create",
      "entry:post:edit_own",
      "entry:post:publish",
      "entry:post:edit_any",
      "entry:post:delete",
      "user:list",
      "user:edit_own",
      "user:create",
      "user:edit",
      "user:promote",
      "user:delete",
      "settings:manage",
    ] satisfies CoreCapability[]) {
      expect(CORE_CAPABILITIES[name]).toBeDefined();
    }
  });
});

describe("derived entry-type capabilities", () => {
  test("override resolves through the capability resolver (hasCapability gates correctly)", () => {
    const registry = createPluginRegistry();
    // Simulate registration side-effect: derive caps and add them.
    for (const cap of deriveEntryTypeCapabilities(
      toRegisteredEntryType(
        "nav_menu_item",
        {
          label: "Menu items",
          capabilities: { edit_any: "admin" },
        },
        null,
      ),
    )) {
      registry.capabilities.set(cap.name, { ...cap, registeredBy: "menus" });
    }
    const resolver = createCapabilityResolver(registry);
    expect(
      resolver.hasCapability("editor", "entry:nav_menu_item:edit_any"),
    ).toBe(false);
    expect(
      resolver.hasCapability("admin", "entry:nav_menu_item:edit_any"),
    ).toBe(true);
  });
});

describe("a registered capability's receiving roles", () => {
  test("resolver grants the cap to exactly the roles it names, independent of hierarchy", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("menu:manage", {
      name: "menu:manage",
      grantTo: ["contributor", "admin"],
      registeredBy: "menus",
    });
    const resolver = createCapabilityResolver(registry);
    expect(resolver.hasCapability("admin", "menu:manage")).toBe(true);
    expect(resolver.hasCapability("contributor", "menu:manage")).toBe(true);
    // Ranking above a named role grants nothing.
    expect(resolver.hasCapability("editor", "menu:manage")).toBe(false);
  });

  test("capabilitiesForRole emits the cap for every role it's granted to", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("menu:manage", {
      name: "menu:manage",
      grantTo: ["editor", "admin"],
      registeredBy: "menus",
    });
    expect(capabilitiesForRole("admin", registry)).toContain("menu:manage");
    expect(capabilitiesForRole("editor", registry)).toContain("menu:manage");
    expect(capabilitiesForRole("author", registry)).not.toContain(
      "menu:manage",
    );
    expect(capabilitiesForRole("subscriber", registry)).not.toContain(
      "menu:manage",
    );
  });
});
