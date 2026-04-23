import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../plugin/manifest.js";
import {
  CapabilityError,
  CORE_CAPABILITIES,
  createCapabilityResolver,
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
    expect(resolver.hasCapability("author", "post:publish")).toBe(true);
    expect(resolver.hasCapability("editor", "post:publish")).toBe(true);
    expect(resolver.hasCapability("admin", "post:publish")).toBe(true);
  });

  test("denies core capability when role is below minimum", () => {
    const resolver = createCapabilityResolver(emptyRegistry);
    expect(resolver.hasCapability("contributor", "post:publish")).toBe(false);
    expect(resolver.hasCapability("subscriber", "post:edit_any")).toBe(false);
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
    registry.capabilities.set("post:delete", {
      name: "post:delete",
      minRole: "admin",
      registeredBy: "strict",
    });
    const resolver = createCapabilityResolver(registry);
    expect(resolver.hasCapability("editor", "post:delete")).toBe(false);
    expect(resolver.hasCapability("admin", "post:delete")).toBe(true);
  });

  test("post-type-derived caps resolve at their registered min-role", () => {
    const registry = createPluginRegistry();
    registry.capabilities.set("landing_page:publish", {
      name: "landing_page:publish",
      minRole: "author",
      registeredBy: "blog",
    });
    const resolver = createCapabilityResolver(registry);
    expect(resolver.hasCapability("contributor", "landing_page:publish")).toBe(
      false,
    );
    expect(resolver.hasCapability("author", "landing_page:publish")).toBe(true);
  });
});

describe("requireCapability", () => {
  const resolver = createCapabilityResolver(createPluginRegistry());

  test("throws unauthorized when user is null", () => {
    expect(() => requireCapability(resolver, null, "post:read")).toThrow(
      CapabilityError,
    );
    try {
      requireCapability(resolver, null, "post:read");
    } catch (err) {
      expect((err as CapabilityError).code).toBe("unauthorized");
    }
  });

  test("throws forbidden when role is too low", () => {
    try {
      requireCapability(resolver, { role: "subscriber" }, "post:publish");
    } catch (err) {
      expect((err as CapabilityError).code).toBe("forbidden");
      expect((err as CapabilityError).capability).toBe("post:publish");
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
      "post:read",
      "post:create",
      "post:edit_own",
      "post:publish",
      "post:edit_any",
      "post:delete",
      "taxonomy:manage",
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
