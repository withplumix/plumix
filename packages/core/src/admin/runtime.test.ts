import { describe, expect, test } from "vitest";

import type { SharedAdminRuntimeSpecifier } from "./runtime.js";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_KEYS,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "./runtime.js";

const specifiers = Object.keys(
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
) as SharedAdminRuntimeSpecifier[];

describe("SHARED_ADMIN_RUNTIME_SPECIFIERS", () => {
  test("every entry resolves to a `plumix/admin/<slug>` sub-export", () => {
    for (const spec of specifiers) {
      expect(SHARED_ADMIN_RUNTIME_SPECIFIERS[spec]).toBe(
        `plumix/admin/${adminRuntimeShimSlug(spec)}`,
      );
    }
  });

  test("sub-export paths are unique — no two specifiers share a shim", () => {
    const values = Object.values(SHARED_ADMIN_RUNTIME_SPECIFIERS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("adminRuntimeShimSlug", () => {
  test("returns the slug portion of the sub-export", () => {
    expect(adminRuntimeShimSlug("react/jsx-runtime")).toBe("react-jsx-runtime");
    expect(adminRuntimeShimSlug("radix-ui")).toBe("radix");
  });

  test("slug is a filename-safe segment (used as `<slug>.js`)", () => {
    for (const spec of specifiers) {
      expect(adminRuntimeShimSlug(spec)).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("SHARED_ADMIN_RUNTIME_KEYS", () => {
  test("names the runtime key every shared specifier's shim reads", () => {
    expect(Object.keys(SHARED_ADMIN_RUNTIME_KEYS).sort()).toEqual(
      [...specifiers].sort(),
    );
    expect(SHARED_ADMIN_RUNTIME_KEYS["react-dom/client"]).toBe(
      "reactDomClient",
    );
  });

  test("runtime keys are unique — no two libraries share a slot", () => {
    const keys = Object.values(SHARED_ADMIN_RUNTIME_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("runtime keys are identifiers", () => {
    for (const key of Object.values(SHARED_ADMIN_RUNTIME_KEYS)) {
      expect(key).toMatch(/^[a-z][A-Za-z]*$/);
    }
  });
});
