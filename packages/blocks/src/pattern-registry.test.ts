import { describe, expect, test } from "vitest";

import { block, definePattern } from "./pattern-registry.js";

// Test-scoped augmentations — exercise that downstream consumers can
// extend both registries via `declare module`.
declare module "./pattern-registry.js" {
  interface BlockTypeRegistry {
    "test/strict-heading": {
      readonly level: 1 | 2 | 3;
      readonly text: string;
    };
  }
  interface PatternCategoryRegistry {
    "test-category": true;
  }
}

describe("definePattern", () => {
  test("returns the spec with the supplied fields and is frozen", () => {
    const pattern = definePattern({
      name: "starter/hero",
      title: "Hero",
      category: "hero",
      content: [],
    });

    expect(pattern.name).toBe("starter/hero");
    expect(pattern.title).toBe("Hero");
    expect(pattern.category).toBe("hero");
    expect(pattern.content).toEqual([]);
    expect(Object.isFrozen(pattern)).toBe(true);
  });

  test("assigns sequential pattern-local IDs to nodes, regardless of definition order", () => {
    // Defining another pattern first must NOT affect the IDs of the
    // second pattern's nodes — they're scoped to the pattern body.
    definePattern({
      name: "x/unused",
      title: "Unused",
      content: [block("core/h", { level: 1 }), block("core/h", { level: 2 })],
    });
    const pattern = definePattern({
      name: "x/hero",
      title: "Hero",
      content: [block("core/h", { level: 1 }), block("core/p", { text: "x" })],
    });

    expect(pattern.content.map((n) => n.id)).toEqual(["p1", "p2"]);
  });

  test("preserves the starter-modal fields — target, entryTypes, priority", () => {
    const pattern = definePattern({
      name: "starter/page-blank",
      title: "Blank page",
      content: [],
      target: "post-content",
      entryTypes: ["page"],
      priority: 5,
    });

    expect(pattern.target).toBe("post-content");
    expect(pattern.entryTypes).toEqual(["page"]);
    expect(pattern.priority).toBe(5);
  });

  test("preserves the preview override field with width, height, and optional alt", () => {
    const pattern = definePattern({
      name: "x/preview",
      title: "P",
      content: [],
      preview: {
        src: "./hero.png",
        width: 1400,
        height: 900,
        alt: "Hero preview",
      },
    });

    expect(pattern.preview).toEqual({
      src: "./hero.png",
      width: 1400,
      height: 900,
      alt: "Hero preview",
    });
  });

  test("typed category registry accepts seeded defaults and augmented categories", () => {
    // Seeded default categories compile.
    definePattern({ name: "x/a", title: "A", category: "hero", content: [] });
    definePattern({ name: "x/b", title: "B", category: "cta", content: [] });
    definePattern({
      name: "x/c",
      title: "C",
      category: "footer",
      content: [],
    });

    // Test-scoped augmented category compiles.
    definePattern({
      name: "x/aug",
      title: "Aug",
      category: "test-category",
      content: [],
    });

    definePattern({
      name: "x/bad",
      title: "Bad",
      // @ts-expect-error - "unknown-category" not in PatternCategoryRegistry
      category: "unknown-category",
      content: [],
    });
  });
});

describe("block()", () => {
  test("produces a BlockNode with the supplied name and attrs", () => {
    const node = block("core/heading", { level: 1, text: "Hello" });

    expect(node.name).toBe("core/heading");
    expect(node.attrs).toEqual({ level: 1, text: "Hello" });
  });

  test("typed registry narrows attrs for augmented names and rejects wrong shapes", () => {
    // Augmented name → narrowed attrs (compiles).
    const ok = block("test/strict-heading", { level: 1, text: "Hi" });
    expect(ok.name).toBe("test/strict-heading");

    // @ts-expect-error - level is not 1 | 2 | 3
    block("test/strict-heading", { level: 7, text: "x" });

    // @ts-expect-error - missing required `text`
    block("test/strict-heading", { level: 1 });

    // Unregistered name → loose attrs fallback (compiles).
    const loose = block("acme/unregistered", { anything: 123 });
    expect(loose.name).toBe("acme/unregistered");
  });
});
