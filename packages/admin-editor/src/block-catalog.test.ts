import { describe, expect, test } from "vitest";

import type { BlockNode, BlockPattern, BlockSpec } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import {
  createBlockFromSpec,
  createNodeFromEntry,
  expandPattern,
  filterPatterns,
  groupBlocksByCategory,
  groupInsertables,
  slotAllowedBlocks,
} from "./block-catalog.js";

const spec = (over: Partial<BlockSpec> & { name: string }): BlockSpec => ({
  render: () => null,
  ...over,
});

const NO_CAPS: ReadonlySet<string> = new Set();

describe("slotAllowedBlocks", () => {
  const registry = createBlockRegistry([
    spec({
      name: "core/buttons",
      inputs: [
        {
          name: "items",
          type: "slot",
          label: "Buttons",
          allowedBlocks: ["core/button"],
        },
      ],
    }),
    spec({
      name: "core/group",
      inputs: [{ name: "content", type: "slot", label: "Content" }],
    }),
  ]);

  test("returns a slot's allowedBlocks list", () => {
    expect(slotAllowedBlocks(registry, "core/buttons", "items")).toEqual([
      "core/button",
    ]);
  });

  test("returns undefined for an unrestricted slot", () => {
    expect(
      slotAllowedBlocks(registry, "core/group", "content"),
    ).toBeUndefined();
  });

  test("returns undefined for an unknown parent or slot", () => {
    expect(slotAllowedBlocks(registry, "core/nope", "items")).toBeUndefined();
    expect(slotAllowedBlocks(registry, "core/buttons", "nope")).toBeUndefined();
  });
});

describe("groupBlocksByCategory", () => {
  test("groups eligible blocks by category in first-seen order", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text", title: "Heading" }),
      spec({ name: "core/image", category: "media", title: "Image" }),
      spec({ name: "core/quote", category: "text", title: "Quote" }),
    ]);

    const groups = groupBlocksByCategory(registry, { capabilities: NO_CAPS });

    expect(groups.map((g) => g.category)).toEqual(["text", "media"]);
    expect(groups[0]?.blocks.map((b) => b.name)).toEqual([
      "core/heading",
      "core/quote",
    ]);
  });

  test("falls back to 'uncategorized' for specs without a category", () => {
    const registry = createBlockRegistry([spec({ name: "core/x" })]);

    const groups = groupBlocksByCategory(registry, { capabilities: NO_CAPS });

    expect(groups[0]?.category).toBe("uncategorized");
  });

  test("excludes blocks with inserter:false", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text" }),
      spec({ name: "core/internal", category: "text", inserter: false }),
    ]);

    const groups = groupBlocksByCategory(registry, { capabilities: NO_CAPS });

    expect(groups[0]?.blocks.map((b) => b.name)).toEqual(["core/heading"]);
  });

  test("excludes capability-gated blocks the viewer lacks", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/public", category: "text" }),
      spec({
        name: "core/secret",
        category: "text",
        capability: "blocks:secret",
      }),
    ]);

    const lacking = groupBlocksByCategory(registry, { capabilities: NO_CAPS });
    expect(lacking[0]?.blocks.map((b) => b.name)).toEqual(["core/public"]);

    const granted = groupBlocksByCategory(registry, {
      capabilities: new Set(["blocks:secret"]),
    });
    expect(granted[0]?.blocks.map((b) => b.name)).toEqual([
      "core/public",
      "core/secret",
    ]);
  });

  test("filters by query against title, name and keywords; drops empty groups", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text", title: "Heading" }),
      spec({
        name: "core/quote",
        category: "text",
        title: "Quote",
        keywords: ["citation"],
      }),
      spec({ name: "core/image", category: "media", title: "Image" }),
    ]);

    // Title match.
    expect(
      groupBlocksByCategory(registry, {
        capabilities: NO_CAPS,
        query: "head",
      }).flatMap((g) => g.blocks.map((b) => b.name)),
    ).toEqual(["core/heading"]);

    // Keyword match — the media group is dropped (no matches).
    const byKeyword = groupBlocksByCategory(registry, {
      capabilities: NO_CAPS,
      query: "citation",
    });
    expect(byKeyword.map((g) => g.category)).toEqual(["text"]);
    expect(byKeyword[0]?.blocks.map((b) => b.name)).toEqual(["core/quote"]);
  });
});

describe("groupInsertables", () => {
  test("includes blocks and their inserter variations, grouped by category", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text", title: "Heading" }),
      spec({
        name: "core/group",
        category: "layout",
        title: "Group",
        variations: [
          { slug: "group/two-col", title: "Two columns", attrs: { cols: 2 } },
        ],
      }),
    ]);

    const groups = groupInsertables(registry, { capabilities: NO_CAPS });
    const slugs = groups.flatMap((g) => g.entries.map((e) => e.slug));

    // The group block has an inserter variation, so the variation surfaces in
    // place of the bare parent; the heading (no variations) surfaces itself.
    expect(slugs).toEqual(["core/heading", "group/two-col"]);
    expect(groups.map((g) => g.category)).toEqual(["text", "layout"]);
  });

  test("excludes inserter:false and capability-gated blocks; filters by query", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text", title: "Heading" }),
      spec({ name: "core/internal", category: "text", inserter: false }),
      spec({ name: "core/secret", category: "text", capability: "x" }),
    ]);

    const slugs = groupInsertables(registry, {
      capabilities: NO_CAPS,
      query: "head",
    }).flatMap((g) => g.entries.map((e) => e.slug));
    expect(slugs).toEqual(["core/heading"]);
  });
});

describe("filterPatterns", () => {
  const patterns: readonly BlockPattern[] = [
    { name: "hero", title: "Hero banner", content: [] },
    { name: "cta", title: "Call to action", keywords: ["button"], content: [] },
  ];

  test("returns all patterns without a query", () => {
    expect(filterPatterns(patterns).map((p) => p.name)).toEqual([
      "hero",
      "cta",
    ]);
  });

  test("matches name, title and keywords", () => {
    expect(filterPatterns(patterns, "hero").map((p) => p.name)).toEqual([
      "hero",
    ]);
    expect(filterPatterns(patterns, "button").map((p) => p.name)).toEqual([
      "cta",
    ]);
  });
});

describe("createNodeFromEntry", () => {
  const registry = createBlockRegistry([
    spec({
      name: "core/group",
      category: "layout",
      defaults: { layout: "flow" },
    }),
  ]);

  test("merges spec defaults under the variation attrs and seeds innerBlocks", () => {
    const node = createNodeFromEntry(registry, {
      name: "core/group",
      slug: "group/two-col",
      title: "Two columns",
      attrs: { layout: "flex-row" },
      innerBlocks: [{ id: "seed-child", name: "core/heading" }],
    });

    // Variation attr wins over the spec default; innerBlocks seed the content
    // slot with freshly minted ids.
    expect(node.attrs?.layout).toBe("flex-row");
    const content = node.attrs?.content as readonly BlockNode[];
    expect(content.map((n) => n.name)).toEqual(["core/heading"]);
    expect(content[0]?.id).not.toBe("seed-child");
  });
});

describe("expandPattern", () => {
  test("copy patterns clone the composition with fresh ids", () => {
    const nodes = expandPattern({
      name: "hero",
      title: "Hero",
      content: [
        { id: "p1", name: "core/heading", attrs: { text: "Hi" } },
        { id: "p2", name: "core/rich-text" },
      ],
    });
    expect(nodes.map((n) => n.name)).toEqual([
      "core/heading",
      "core/rich-text",
    ]);
    expect(nodes.map((n) => n.id)).not.toContain("p1");
  });

  test("reference patterns insert a single core/pattern-ref node", () => {
    const nodes = expandPattern({
      name: "cta",
      title: "CTA",
      insert: "reference",
      content: [{ id: "p1", name: "core/heading" }],
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.name).toBe("core/pattern-ref");
    expect(nodes[0]?.attrs?.slug).toBe("cta");
  });
});

describe("createBlockFromSpec", () => {
  test("mints a fresh node with the spec's name and defaults", () => {
    const node = createBlockFromSpec(
      spec({ name: "core/heading", defaults: { level: 2 } }),
    );
    expect(node.name).toBe("core/heading");
    expect(node.attrs).toEqual({ level: 2 });
    // A real, non-seed id so two inserts never collide.
    expect(node.id).not.toBe("seed");
    expect(node.id.length).toBeGreaterThan(0);
    expect(createBlockFromSpec(spec({ name: "core/heading" })).id).not.toBe(
      node.id,
    );
  });
});
