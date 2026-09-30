import { describe, expect, test } from "vitest";

import { toRegisteredEntryType } from "../../plugin/registry.js";
import {
  canAccessAdmin,
  deriveEntryTypeCapabilities,
  deriveTermTaxonomyCapabilities,
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

describe("canAccessAdmin", () => {
  test("locks subscribers out of the admin", () => {
    expect(canAccessAdmin("subscriber")).toBe(false);
  });

  test("admits every staff role from contributor up", () => {
    expect(canAccessAdmin("contributor")).toBe(true);
    expect(canAccessAdmin("author")).toBe(true);
    expect(canAccessAdmin("editor")).toBe(true);
    expect(canAccessAdmin("admin")).toBe(true);
  });
});

describe("deriveEntryTypeCapabilities", () => {
  test("defaults match POST_TYPE_CAPABILITY_ACTIONS when no override is set", () => {
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType("post", { label: "Posts" }, null),
    );
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
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType(
        "nav_menu_item",
        {
          label: "Menu items",
          capabilities: {
            read: "admin",
            create: "admin",
            edit_own: "admin",
            publish: "admin",
            edit_any: "admin",
            delete: "admin",
            read_revisions: "admin",
            restore_revision: "admin",
          },
        },
        null,
      ),
    );
    for (const cap of caps) {
      expect(cap.minRole).toBe("admin");
    }
  });

  test("partial override leaves non-overridden actions at their default minRole", () => {
    // Media-shape: only `create` is remapped (author+ can upload).
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType(
        "attachment",
        {
          label: "Attachments",
          capabilities: { create: "author" },
        },
        null,
      ),
    );
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
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType(
        "story",
        {
          label: "Stories",
          capabilityType: "post",
          capabilities: { delete: "admin" },
        },
        null,
      ),
    );
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.minRole]));
    expect(byName["entry:post:delete"]).toBe("admin");
    expect(byName["entry:post:publish"]).toBe("author");
  });
});

describe("deriveTermTaxonomyCapabilities", () => {
  test("defaults match TAXONOMY_CAPABILITY_ACTIONS when no override is set", () => {
    const caps = deriveTermTaxonomyCapabilities("category", {});
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.minRole]));
    expect(byName["term:category:assign"]).toBe("contributor");
    expect(byName["term:category:manage"]).toBe("editor");
    expect(byName["term:category:edit"]).toBe("editor");
    expect(byName["term:category:delete"]).toBe("editor");
  });

  test("nav_menu-shape override raises every action to admin", () => {
    const caps = deriveTermTaxonomyCapabilities("nav_menu", {
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
