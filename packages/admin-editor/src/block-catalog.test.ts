import { describe, expect, test } from "vitest";

import type { BlockNode, BlockPattern, BlockSpec } from "@plumix/blocks";
import { columnsBlock, createBlockRegistry } from "@plumix/blocks";

import {
  createNodeFromEntry,
  expandPattern,
  filterPatterns,
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

  test("falls back to 'uncategorized' for specs without a category", () => {
    const registry = createBlockRegistry([spec({ name: "core/x" })]);
    expect(
      groupInsertables(registry, { capabilities: NO_CAPS })[0]?.category,
    ).toBe("uncategorized");
  });

  test("admits capability-gated blocks once the viewer holds the capability", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/secret", category: "text", capability: "x" }),
    ]);
    expect(
      groupInsertables(registry, {
        capabilities: new Set(["x"]),
      }).flatMap((g) => g.entries.map((e) => e.slug)),
    ).toEqual(["core/secret"]);
  });

  test("restricts to allowed block names when an allow-list is given", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text", title: "Heading" }),
      spec({ name: "core/quote", category: "text", title: "Quote" }),
      spec({ name: "core/spacer", category: "layout", title: "Spacer" }),
    ]);

    const slugs = groupInsertables(registry, {
      capabilities: NO_CAPS,
      allowed: ["core/heading", "core/spacer"],
    }).flatMap((g) => g.entries.map((e) => e.name));

    expect(slugs).toEqual(["core/heading", "core/spacer"]);
  });

  test("hides requiresParent blocks unless the target parent matches", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text", title: "Heading" }),
      spec({
        name: "core/button",
        category: "interactive",
        title: "Button",
        requiresParent: ["core/buttons"],
      }),
    ]);
    const names = (parentName?: string): readonly string[] =>
      groupInsertables(registry, { capabilities: NO_CAPS, parentName }).flatMap(
        (g) => g.entries.map((e) => e.name),
      );

    // Root inserter (no parent) hides the parent-bound button.
    expect(names()).toEqual(["core/heading"]);
    // Offered only when scoped to a matching parent.
    expect(names("core/buttons")).toContain("core/button");
    expect(names("core/group")).not.toContain("core/button");
  });

  test("an undefined allow-list permits every eligible block", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", category: "text", title: "Heading" }),
      spec({ name: "core/quote", category: "text", title: "Quote" }),
    ]);

    const slugs = groupInsertables(registry, {
      capabilities: NO_CAPS,
      allowed: undefined,
    }).flatMap((g) => g.entries.map((e) => e.name));

    expect(slugs).toEqual(["core/heading", "core/quote"]);
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

  test("seeds node.style from the spec's defaultStyles", () => {
    const seeded = createBlockRegistry([
      spec({
        name: "core/button",
        defaultStyles: {
          large: { backgroundColor: "var(--plumix-button-bg, #111827)" },
        },
      }),
    ]);

    const node = createNodeFromEntry(seeded, {
      name: "core/button",
      slug: "core/button",
      title: "Button",
    });

    // The default styles land in node.style, so they show up (editable) in the
    // Styles section rather than as baked, hidden CSS.
    expect(node.style).toEqual({
      large: { backgroundColor: "var(--plumix-button-bg, #111827)" },
    });
  });

  test("mints a fresh, unique id for every node so two inserts never collide", () => {
    const entry = { name: "core/group", slug: "core/group", title: "Group" };
    const a = createNodeFromEntry(registry, entry);
    const b = createNodeFromEntry(registry, entry);
    expect(a.id).not.toBe("seed");
    expect(a.id.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id);
  });

  test("seeds a slot's defaultChildren so a fresh container isn't bare", () => {
    const seeded = createBlockRegistry([
      spec({
        name: "core/columns",
        category: "layout",
        inputs: [
          {
            name: "left",
            type: "slot",
            defaultChildren: [{ id: "d1", name: "core/rich-text" }],
          },
          { name: "right", type: "slot" },
        ],
      }),
    ]);

    const node = createNodeFromEntry(seeded, {
      name: "core/columns",
      slug: "core/columns",
      title: "Columns",
    });

    const left = node.attrs?.left as readonly BlockNode[];
    expect(left.map((n) => n.name)).toEqual(["core/rich-text"]);
    // Freshly minted id, not the spec's template id.
    expect(left[0]?.id).not.toBe("d1");
    // A slot with no default stays absent (the empty-slot appender covers it).
    expect(node.attrs?.right).toBeUndefined();
  });

  test("the core/columns block seeds a paragraph into each column", () => {
    const reg = createBlockRegistry([columnsBlock]);
    const node = createNodeFromEntry(reg, {
      name: "core/columns",
      slug: "core/columns",
      title: "Columns",
    });
    expect(
      (node.attrs?.left as readonly BlockNode[]).map((n) => n.name),
    ).toEqual(["core/rich-text"]);
    expect(
      (node.attrs?.right as readonly BlockNode[]).map((n) => n.name),
    ).toEqual(["core/rich-text"]);
  });

  test("an explicit slot value wins over the slot's defaultChildren", () => {
    const seeded = createBlockRegistry([
      spec({
        name: "core/columns",
        category: "layout",
        inputs: [
          {
            name: "left",
            type: "slot",
            defaultChildren: [{ id: "d1", name: "core/rich-text" }],
          },
        ],
      }),
    ]);

    const node = createNodeFromEntry(seeded, {
      name: "core/columns",
      slug: "core/columns",
      title: "Columns",
      attrs: { left: [{ id: "x", name: "core/heading" }] },
    });

    expect(
      (node.attrs?.left as readonly BlockNode[]).map((n) => n.name),
    ).toEqual(["core/heading"]);
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
