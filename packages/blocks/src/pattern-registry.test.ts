import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
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

  test("preserves the insert mode field — copy + reference both round-trip", () => {
    const copy = definePattern({
      name: "x/copy",
      title: "C",
      content: [],
      insert: "copy",
    });
    const ref = definePattern({
      name: "x/ref",
      title: "R",
      content: [],
      insert: "reference",
    });

    expect(copy.insert).toBe("copy");
    expect(ref.insert).toBe("reference");
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

  test("throws when a pattern body references an unregistered pattern via core/pattern-ref", () => {
    const ref = defineBlock({
      name: "core/pattern-ref",
      inserter: false,
      inputs: [{ name: "slug", type: "text" }],
      render: () => null,
    });
    const refBlocks = createBlockRegistry([ref]);
    const wrapper = definePattern({
      name: "starter/wrapper",
      title: "Wrapper",
      content: [block("core/pattern-ref", { slug: "starter/missing" })],
    });
    const patterns = createPatternRegistry([wrapper]);

    expect(() => commitPatterns(patterns, refBlocks)).toThrow(
      /starter\/wrapper.*starter\/missing/,
    );
  });

  test("accepts pattern bodies whose pattern-ref targets ARE registered", () => {
    const ref = defineBlock({
      name: "core/pattern-ref",
      inserter: false,
      inputs: [{ name: "slug", type: "text" }],
      render: () => null,
    });
    const refBlocks = createBlockRegistry([ref]);
    const target = definePattern({
      name: "starter/target",
      title: "Target",
      content: [],
    });
    const wrapper = definePattern({
      name: "starter/wrapper-ok",
      title: "Wrapper",
      content: [block("core/pattern-ref", { slug: "starter/target" })],
    });
    const patterns = createPatternRegistry([target, wrapper]);

    expect(() => commitPatterns(patterns, refBlocks)).not.toThrow();
  });

  test("throws on a malformed core/pattern-ref (missing or non-string slug)", () => {
    const ref = defineBlock({
      name: "core/pattern-ref",
      inserter: false,
      inputs: [{ name: "slug", type: "text" }],
      render: () => null,
    });
    const refBlocks = createBlockRegistry([ref]);
    const broken = definePattern({
      name: "starter/broken-ref",
      title: "Broken",
      content: [block("core/pattern-ref", { slug: 123 })],
    });
    const patterns = createPatternRegistry([broken]);

    expect(() => commitPatterns(patterns, refBlocks)).toThrow(
      /starter\/broken-ref.*missing or non-string slug/,
    );
  });

  test("throws on a pattern-ref cycle, naming the full chain of involved slugs", () => {
    const ref = defineBlock({
      name: "core/pattern-ref",
      inserter: false,
      inputs: [{ name: "slug", type: "text" }],
      render: () => null,
    });
    const refBlocks = createBlockRegistry([ref]);
    const a = definePattern({
      name: "starter/a",
      title: "A",
      content: [block("core/pattern-ref", { slug: "starter/b" })],
    });
    const b = definePattern({
      name: "starter/b",
      title: "B",
      content: [block("core/pattern-ref", { slug: "starter/c" })],
    });
    const c = definePattern({
      name: "starter/c",
      title: "C",
      content: [block("core/pattern-ref", { slug: "starter/a" })],
    });
    const patterns = createPatternRegistry([a, b, c]);

    expect(() => commitPatterns(patterns, refBlocks)).toThrow(
      /starter\/a.*starter\/b.*starter\/c.*starter\/a/,
    );
  });

  test("inlines core/pattern-ref nodes inside pattern bodies — resolved registry contains no refs", () => {
    const ref = defineBlock({
      name: "core/pattern-ref",
      inserter: false,
      inputs: [{ name: "slug", type: "text" }],
      render: () => null,
    });
    const heading = defineBlock({
      name: "core/heading",
      inputs: [{ name: "text", type: "text" }],
      render: () => null,
    });
    const refBlocks = createBlockRegistry([ref, heading]);
    const inner = definePattern({
      name: "starter/inner",
      title: "Inner",
      content: [block("core/heading", { text: "From inner" })],
    });
    const outer = definePattern({
      name: "starter/outer",
      title: "Outer",
      content: [
        block("core/heading", { text: "Outer top" }),
        block("core/pattern-ref", { slug: "starter/inner" }),
        block("core/heading", { text: "Outer bottom" }),
      ],
    });
    const patterns = createPatternRegistry([inner, outer]);

    const resolved = commitPatterns(patterns, refBlocks);
    const resolvedOuter = resolved.get("starter/outer");

    expect(resolvedOuter?.content.map((n) => n.name)).toEqual([
      "core/heading",
      "core/heading",
      "core/heading",
    ]);
    const texts = resolvedOuter?.content.map((n) => n.attrs?.text);
    expect(texts).toEqual(["Outer top", "From inner", "Outer bottom"]);
  });

  test("post-commit invariant: no pattern body contains a core/pattern-ref node at any depth", () => {
    const ref = defineBlock({
      name: "core/pattern-ref",
      inserter: false,
      inputs: [{ name: "slug", type: "text" }],
      render: () => null,
    });
    const group = defineBlock({
      name: "core/group",
      inputs: [{ name: "content", type: "slot" }],
      render: () => null,
    });
    const heading = defineBlock({
      name: "core/heading",
      inputs: [{ name: "text", type: "text" }],
      render: () => null,
    });
    const refBlocks = createBlockRegistry([ref, group, heading]);
    const inner = definePattern({
      name: "starter/inner",
      title: "Inner",
      content: [block("core/heading", { text: "Inner" })],
    });
    const outer = definePattern({
      name: "starter/outer-nested",
      title: "Outer",
      content: [
        block("core/group", {
          content: [block("core/pattern-ref", { slug: "starter/inner" })],
        }),
      ],
    });
    const patterns = createPatternRegistry([inner, outer]);

    const resolved = commitPatterns(patterns, refBlocks);

    function containsRef(nodes: readonly BlockNode[]): boolean {
      for (const node of nodes) {
        if (node.name === "core/pattern-ref") return true;
        for (const value of Object.values(node.attrs ?? {})) {
          if (Array.isArray(value) && containsRef(value as BlockNode[])) {
            return true;
          }
        }
      }
      return false;
    }

    for (const pattern of resolved) {
      expect(containsRef(pattern.content)).toBe(false);
    }
  });
});
