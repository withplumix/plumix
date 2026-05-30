import { describe, expect, test } from "vitest";

import { createBlockRegistry, defineBlock } from "./block-registry.js";
import {
  block,
  commitPatterns,
  createPatternRegistry,
  definePattern,
} from "./pattern-registry.js";

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

describe("createPatternRegistry", () => {
  test("looks up a registered pattern by slug", () => {
    const hero = definePattern({
      name: "starter/hero",
      title: "Hero",
      content: [],
    });
    const registry = createPatternRegistry([hero]);

    expect(registry.get("starter/hero")).toBe(hero);
    expect(registry.has("starter/hero")).toBe(true);
    expect(registry.has("acme/missing")).toBe(false);
    expect(registry.size).toBe(1);
  });

  test("iteration yields patterns in insertion order", () => {
    const hero = definePattern({ name: "a/hero", title: "Hero", content: [] });
    const cta = definePattern({ name: "a/cta", title: "CTA", content: [] });
    const footer = definePattern({
      name: "a/footer",
      title: "Footer",
      content: [],
    });
    const registry = createPatternRegistry([hero, cta, footer]);

    expect([...registry].map((p) => p.name)).toEqual([
      "a/hero",
      "a/cta",
      "a/footer",
    ]);
  });

  test("throws on duplicate slug, naming the slug", () => {
    const a = definePattern({ name: "x/y", title: "A", content: [] });
    const b = definePattern({ name: "x/y", title: "B", content: [] });

    expect(() => createPatternRegistry([a, b])).toThrow(/x\/y/);
  });
});

describe("commitPatterns", () => {
  const heading = defineBlock({
    name: "core/heading",
    render: () => null,
  });
  const blocks = createBlockRegistry([heading]);

  test("happy path: returns the registry when every block in every pattern body is registered", () => {
    const hero = definePattern({
      name: "starter/hero",
      title: "Hero",
      content: [block("core/heading", { level: 1, text: "Hi" })],
    });
    const patterns = createPatternRegistry([hero]);

    const resolved = commitPatterns(patterns, blocks);

    expect(resolved.get("starter/hero")).toBe(hero);
    expect(resolved.size).toBe(1);
  });

  test("throws when a pattern body references an unknown block, naming the pattern slug and the missing block", () => {
    const broken = definePattern({
      name: "starter/broken",
      title: "Broken",
      content: [block("acme/missing", {})],
    });
    const patterns = createPatternRegistry([broken]);

    expect(() => commitPatterns(patterns, blocks)).toThrow(
      /starter\/broken.*acme\/missing/,
    );
  });

  test("throws when a pattern body uses an attr key the block's inputs do not declare", () => {
    const headingWithInputs = defineBlock({
      name: "core/heading-strict",
      inputs: [{ name: "level", type: "select", options: [] }],
      render: () => null,
    });
    const strictBlocks = createBlockRegistry([headingWithInputs]);
    const broken = definePattern({
      name: "starter/attrs-mismatch",
      title: "Broken",
      content: [block("core/heading-strict", { level: 1, garbage: "x" })],
    });
    const patterns = createPatternRegistry([broken]);

    expect(() => commitPatterns(patterns, strictBlocks)).toThrow(
      /starter\/attrs-mismatch.*garbage/,
    );
  });
});
