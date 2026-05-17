import { describe, expect, test } from "vitest";

import type { BlockRegistry, ResolvedBlockSpec } from "@plumix/blocks";

import { itemsFromRegistry } from "./items-from-registry.js";

function spec(
  partial: Partial<ResolvedBlockSpec> & { name: string; title: string },
): ResolvedBlockSpec {
  return {
    name: partial.name,
    title: partial.title,
    description: partial.description,
    category: partial.category ?? "typography",
    keywords: partial.keywords,
    component: () => null,
    legacyAliases: undefined,
    schema: () => Promise.resolve({} as never),
    registeredBy: null,
    allowedBlocks: undefined,
    parent: undefined,
    defaults: undefined,
  } as unknown as ResolvedBlockSpec;
}

function fakeRegistry(specs: readonly ResolvedBlockSpec[]): BlockRegistry {
  const map = new Map(specs.map((s) => [s.name, s]));
  return {
    get: (name) => map.get(name),
    has: (name) => map.has(name),
    size: map.size,
    [Symbol.iterator]: () => map.entries(),
  } satisfies BlockRegistry;
}

describe("itemsFromRegistry", () => {
  test("projects every block in the registry into a SlashMenuItem", () => {
    const registry = fakeRegistry([
      spec({ name: "core/heading", title: "Heading", category: "typography" }),
      spec({ name: "core/columns", title: "Columns", category: "layout" }),
    ]);
    const items = itemsFromRegistry(registry);
    expect(items.map((i) => i.name).sort()).toEqual([
      "core/columns",
      "core/heading",
    ]);
    expect(items.find((i) => i.name === "core/columns")?.category).toBe(
      "layout",
    );
  });

  test("forwards description and keywords through unchanged", () => {
    const registry = fakeRegistry([
      spec({
        name: "core/quote",
        title: "Quote",
        description: "Pull quote",
        keywords: ["blockquote"],
      }),
    ]);
    const item = itemsFromRegistry(registry)[0];
    expect(item?.description).toBe("Pull quote");
    expect(item?.keywords).toEqual(["blockquote"]);
  });

  test("emits one item per variation in addition to the parent block", () => {
    const groupSpec = spec({
      name: "core/group",
      title: "Group",
      category: "layout",
    });
    (groupSpec as unknown as { variations: unknown }).variations = [
      {
        name: "row",
        title: "Row",
        description: "Horizontal flex container.",
        attributes: { layout: "flex-row" },
      },
      {
        name: "stack",
        title: "Stack",
        attributes: { layout: "flex-column" },
      },
    ];
    const registry = fakeRegistry([groupSpec]);
    const items = itemsFromRegistry(registry);
    expect(items.map((i) => i.name).sort()).toEqual([
      "core/group",
      "core/group:row",
      "core/group:stack",
    ]);
    const row = items.find((i) => i.name === "core/group:row");
    expect(row?.title).toBe("Row");
    expect(row?.description).toBe("Horizontal flex container.");
    expect(row?.parent).toBe("core/group");
    expect(row?.attributes).toEqual({ layout: "flex-row" });
  });

  test("skips blocks that are content-only (children of another block)", () => {
    const child = spec({
      name: "core/column",
      title: "Column",
      category: "layout",
    });
    (child as unknown as { parent: string }).parent = "core/columns";
    const registry = fakeRegistry([
      child,
      spec({ name: "core/columns", title: "Columns", category: "layout" }),
    ]);
    const items = itemsFromRegistry(registry);
    expect(items.map((i) => i.name)).toEqual(["core/columns"]);
  });
});
