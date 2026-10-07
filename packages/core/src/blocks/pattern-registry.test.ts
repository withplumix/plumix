import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry, defineBlock } from "./block-registry.js";
import { groupBlock } from "./group/index.js";
import { assignPatternIds, block, definePattern } from "./pattern-registry.js";

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

describe("assignPatternIds", () => {
  const blocks = createBlockRegistry([
    groupBlock,
    defineBlock({ name: "acme/team", render: () => null }),
  ]);

  // A node's slot children are numbered before the node itself.
  test("numbers blank ids p1, p2, ... through declared slots", () => {
    const content = [
      block("core/group", { content: [block("core/h", { level: 1 })] }),
      block("core/p", { text: "x" }),
    ];

    const out = assignPatternIds(content, blocks);
    const inner = out[0]?.attrs?.content as readonly BlockNode[];

    expect([out[0]?.id, inner[0]?.id, out[1]?.id]).toEqual(["p2", "p1", "p3"]);
  });

  test.each([
    ["an empty data array", []],
    ["a data array of id/name objects", [{ id: "1", name: "Alice" }]],
  ])("leaves %s in an attr no slot declares as stored", (_, people) => {
    const out = assignPatternIds([block("acme/team", { people })], blocks);

    expect(out[0]?.attrs?.people).toEqual(people);
  });

  test("leaves an unregistered block's children as stored", () => {
    const content = [block("core/h", { level: 1 })];

    const out = assignPatternIds([block("acme/missing", { content })], blocks);

    expect(out[0]?.attrs?.content).toEqual(content);
  });
});
