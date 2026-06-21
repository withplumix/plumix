import { describe, expect, test } from "vitest";

import type { BlockSpec } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import {
  createBlockFromSpec,
  groupBlocksByCategory,
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
