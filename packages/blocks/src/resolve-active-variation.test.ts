import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { defineBlock } from "./block-registry.js";
import { resolveActiveVariation } from "./resolve-active-variation.js";

const warnSpy = vi.spyOn(console, "warn");

beforeEach(() => {
  warnSpy.mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockReset();
});

describe("resolveActiveVariation", () => {
  test("returns undefined when the block declares no variations", () => {
    const spec = defineBlock({
      name: "x-test/leaf",
      title: "Leaf",
      render: () => null,
    });
    expect(resolveActiveVariation(spec, { text: "x" })).toBeUndefined();
  });

  test("string[] matcher returns the variation when every listed attr equals the variation's attrs", () => {
    const spec = defineBlock({
      name: "core/list",
      title: "List",
      render: () => null,
      variations: [
        {
          slug: "bullet",
          title: "Bulleted",
          attrs: { variant: "bullet" },
          isActive: ["variant"],
        },
      ],
    });
    const match = resolveActiveVariation(spec, { variant: "bullet" });
    expect(match?.slug).toBe("bullet");
  });

  test("string[] matcher returns undefined when an attr value differs", () => {
    const spec = defineBlock({
      name: "core/list",
      title: "List",
      render: () => null,
      variations: [
        {
          slug: "bullet",
          title: "Bulleted",
          attrs: { variant: "bullet" },
          isActive: ["variant"],
        },
      ],
    });
    expect(
      resolveActiveVariation(spec, { variant: "numbered" }),
    ).toBeUndefined();
  });

  test("string[] specificity: the variation with the longest matching list wins", () => {
    const spec = defineBlock({
      name: "core/columns",
      title: "Columns",
      render: () => null,
      variations: [
        {
          slug: "two-up",
          title: "Two up",
          attrs: { layout: "split" },
          isActive: ["layout"],
        },
        {
          slug: "two-up-equal",
          title: "Two up equal",
          attrs: { layout: "split", ratio: "50-50" },
          isActive: ["layout", "ratio"],
        },
      ],
    });
    const match = resolveActiveVariation(spec, {
      layout: "split",
      ratio: "50-50",
    });
    expect(match?.slug).toBe("two-up-equal");
  });

  test("string[] tie of equal length is broken by registration order — first wins", () => {
    const spec = defineBlock({
      name: "core/badge",
      title: "Badge",
      render: () => null,
      variations: [
        {
          slug: "rounded-primary",
          title: "Rounded primary",
          attrs: { shape: "round", color: "primary" },
          isActive: ["shape", "color"],
        },
        {
          slug: "rounded-primary-alt",
          title: "Rounded primary alt",
          attrs: { shape: "round", color: "primary" },
          isActive: ["shape", "color"],
        },
      ],
    });
    const match = resolveActiveVariation(spec, {
      shape: "round",
      color: "primary",
    });
    expect(match?.slug).toBe("rounded-primary");
  });

  test("function matcher returns the first variation whose predicate is true", () => {
    const spec = defineBlock({
      name: "core/quote",
      title: "Quote",
      render: () => null,
      variations: [
        {
          slug: "long",
          title: "Long quote",
          isActive: (attrs) =>
            typeof attrs.text === "string" && attrs.text.length > 100,
        },
        {
          slug: "short",
          title: "Short quote",
          isActive: (attrs) =>
            typeof attrs.text === "string" && attrs.text.length <= 100,
        },
      ],
    });
    const short = resolveActiveVariation(spec, { text: "hi" });
    expect(short?.slug).toBe("short");
    const long = resolveActiveVariation(spec, { text: "x".repeat(200) });
    expect(long?.slug).toBe("long");
  });

  test("function matcher that throws is treated as false and surfaced via console.warn", () => {
    const spec = defineBlock({
      name: "core/quote",
      title: "Quote",
      render: () => null,
      variations: [
        {
          slug: "boom",
          title: "Boom",
          isActive: () => {
            throw new Error("nope");
          },
        },
        {
          slug: "fallback",
          title: "Fallback",
          isActive: () => true,
        },
      ],
    });
    const match = resolveActiveVariation(spec, {});
    expect(match?.slug).toBe("fallback");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("core/quote"),
      expect.stringContaining("boom"),
      expect.any(Error),
    );
  });
});
