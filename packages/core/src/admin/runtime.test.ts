import { describe, expect, test } from "vitest";

import type { SharedAdminRuntimeSpecifier } from "./runtime.js";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "./runtime.js";

describe("SHARED_ADMIN_RUNTIME_SPECIFIERS", () => {
  test("covers every shared library plugin chunks may need", () => {
    expect(Object.keys(SHARED_ADMIN_RUNTIME_SPECIFIERS).sort()).toEqual([
      "@tanstack/react-query",
      "@tanstack/react-router",
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
    ]);
  });

  test("every entry resolves to a `plumix/admin/<slug>` sub-export", () => {
    for (const value of Object.values(SHARED_ADMIN_RUNTIME_SPECIFIERS)) {
      expect(value).toMatch(/^plumix\/admin\/[a-z-]+$/);
    }
  });

  test("sub-export paths are unique — no two specifiers share a shim", () => {
    const values = Object.values(SHARED_ADMIN_RUNTIME_SPECIFIERS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("adminRuntimeShimSlug", () => {
  test("returns the slug portion of the sub-export", () => {
    expect(adminRuntimeShimSlug("react")).toBe("react");
    expect(adminRuntimeShimSlug("react/jsx-runtime")).toBe("react-jsx-runtime");
    expect(adminRuntimeShimSlug("react-dom/client")).toBe("react-dom-client");
    expect(adminRuntimeShimSlug("@tanstack/react-query")).toBe("react-query");
    expect(adminRuntimeShimSlug("@tanstack/react-router")).toBe("react-router");
  });

  test("slug is a filename-safe segment (used as `<slug>.js`)", () => {
    const allSpecifiers = Object.keys(
      SHARED_ADMIN_RUNTIME_SPECIFIERS,
    ) as SharedAdminRuntimeSpecifier[];
    for (const spec of allSpecifiers) {
      expect(adminRuntimeShimSlug(spec)).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
