import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../plugin/manifest.js";
import {
  capabilitiesForRole,
  CapabilityError,
  CORE_CAPABILITIES,
  createCapabilityResolver,
  deriveEntryTypeCapabilities,
  deriveTermTaxonomyCapabilities,
  requireCapability,
  roleLevel,
} from "./rbac.js";

describe("role hierarchy", () => {
  test("admin outranks every other role", () => {
    expect(roleLevel("admin")).toBeGreaterThan(roleLevel("editor"));
    expect(roleLevel("editor")).toBeGreaterThan(roleLevel("author"));
    expect(roleLevel("author")).toBeGreaterThan(roleLevel("contributor"));
    expect(roleLevel("contributor")).toBeGreaterThan(roleLevel("subscriber"));
  });
});

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

  test("plugin-registered capabilities are looked up alongside core", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("seo:manage", {
      name: "seo:manage",
      minRole: "editor",
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
      minRole: "admin",
      registeredBy: "strict",
    });
    const resolver = createCapabilityResolver(registry);
    expect(resolver.hasCapability("editor", "entry:post:delete")).toBe(false);
    expect(resolver.hasCapability("admin", "entry:post:delete")).toBe(true);
  });

  test("post-type-derived caps resolve at their registered min-role", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("entry:landing_page:publish", {
      name: "entry:landing_page:publish",
      minRole: "author",
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

describe("requireCapability", () => {
  const resolver = createCapabilityResolver(createPluginRegistry());

  test("throws unauthorized when user is null", () => {
    expect(() => requireCapability(resolver, null, "entry:post:read")).toThrow(
      CapabilityError,
    );
    try {
      requireCapability(resolver, null, "entry:post:read");
    } catch (err) {
      expect((err as CapabilityError).code).toBe("unauthorized");
    }
  });

  test("throws forbidden when role is too low", () => {
    try {
      requireCapability(resolver, { role: "subscriber" }, "entry:post:publish");
    } catch (err) {
      expect((err as CapabilityError).code).toBe("forbidden");
      expect((err as CapabilityError).capability).toBe("entry:post:publish");
      return;
    }
    throw new Error("should have thrown");
  });

  test("passes silently for a satisfied capability", () => {
    expect(() =>
      requireCapability(resolver, { role: "admin" }, "user:edit"),
    ).not.toThrow();
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
    ]) {
      expect(CORE_CAPABILITIES[name]).toBeDefined();
    }
  });
});

describe("deriveEntryTypeCapabilities", () => {
  test("defaults match POST_TYPE_CAPABILITY_ACTIONS when no override is set", () => {
    const caps = deriveEntryTypeCapabilities("post", { label: "Posts" });
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.minRole]));
    expect(byName["entry:post:read"]).toBe("subscriber");
    expect(byName["entry:post:edit_own"]).toBe("contributor");
    expect(byName["entry:post:publish"]).toBe("author");
    expect(byName["entry:post:edit_any"]).toBe("editor");
    expect(byName["entry:post:delete"]).toBe("editor");
    expect(byName["entry:post:create"]).toBe("contributor");
  });

  test("`capabilities` override raises minRole on specified actions only", () => {
    // Menu-item-shape: every action requires admin — editors lose access.
    const caps = deriveEntryTypeCapabilities("nav_menu_item", {
      label: "Menu items",
      capabilities: {
        read: "admin",
        create: "admin",
        edit_own: "admin",
        publish: "admin",
        edit_any: "admin",
        delete: "admin",
      },
    });
    for (const cap of caps) {
      expect(cap.minRole).toBe("admin");
    }
  });

  test("partial override leaves non-overridden actions at their default minRole", () => {
    // Media-shape: only `create` is remapped (author+ can upload).
    const caps = deriveEntryTypeCapabilities("attachment", {
      label: "Attachments",
      capabilities: { create: "author" },
    });
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.minRole]));
    expect(byName["entry:attachment:create"]).toBe("author");
    // Other actions remain at defaults.
    expect(byName["entry:attachment:read"]).toBe("subscriber");
    expect(byName["entry:attachment:edit_own"]).toBe("contributor");
    expect(byName["entry:attachment:publish"]).toBe("author");
  });

  test("overrides compose with capabilityType pooling", () => {
    // capabilityType pools derived cap names; override still applies to
    // the pooled name.
    const caps = deriveEntryTypeCapabilities("story", {
      label: "Stories",
      capabilityType: "post",
      capabilities: { delete: "admin" },
    });
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.minRole]));
    expect(byName["entry:post:delete"]).toBe("admin");
    expect(byName["entry:post:publish"]).toBe("author");
  });

  test("override resolves through the capability resolver (hasCapability gates correctly)", () => {
    const registry = createPluginRegistry();
    // Simulate registration side-effect: derive caps and add them.
    for (const cap of deriveEntryTypeCapabilities("nav_menu_item", {
      label: "Menu items",
      capabilities: { edit_any: "admin" },
    })) {
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

describe("deriveTermTaxonomyCapabilities", () => {
  test("defaults match TAXONOMY_CAPABILITY_ACTIONS when no override is set", () => {
    const caps = deriveTermTaxonomyCapabilities("category", { label: "Cats" });
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.minRole]));
    expect(byName["term:category:assign"]).toBe("contributor");
    expect(byName["term:category:manage"]).toBe("editor");
    expect(byName["term:category:edit"]).toBe("editor");
    expect(byName["term:category:delete"]).toBe("editor");
  });

  test("nav_menu-shape override raises every action to admin", () => {
    const caps = deriveTermTaxonomyCapabilities("nav_menu", {
      label: "Nav menus",
      capabilities: {
        read: "admin",
        assign: "admin",
        edit: "admin",
        delete: "admin",
        manage: "admin",
      },
    });
    for (const cap of caps) {
      expect(cap.minRole).toBe("admin");
    }
  });
});

describe("defaultGrants on registered capabilities", () => {
  test("resolver grants the cap to a role listed in defaultGrants, independent of hierarchy", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("menu:manage", {
      name: "menu:manage",
      minRole: "admin",
      defaultGrants: ["editor"],
      registeredBy: "menus",
    });
    const resolver = createCapabilityResolver(registry);
    // Admin has it by hierarchy.
    expect(resolver.hasCapability("admin", "menu:manage")).toBe(true);
    // Editor has it via explicit grant even though editor < admin.
    expect(resolver.hasCapability("editor", "menu:manage")).toBe(true);
    // Author isn't granted and doesn't meet the admin minRole.
    expect(resolver.hasCapability("author", "menu:manage")).toBe(false);
  });

  test("capabilitiesForRole emits the cap for every role it's granted to", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("menu:manage", {
      name: "menu:manage",
      minRole: "admin",
      defaultGrants: ["editor"],
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

  test("caps without defaultGrants fall back to hierarchy-only behaviour", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("seo:manage", {
      name: "seo:manage",
      minRole: "editor",
      registeredBy: "seo",
    });
    expect(capabilitiesForRole("admin", registry)).toContain("seo:manage");
    expect(capabilitiesForRole("editor", registry)).toContain("seo:manage");
    expect(capabilitiesForRole("author", registry)).not.toContain("seo:manage");
  });
});
