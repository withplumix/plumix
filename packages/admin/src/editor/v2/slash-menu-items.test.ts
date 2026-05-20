import type { BlockSpecV2 } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";
import { describe, expect, test } from "vitest";

import {
  nextInsertPoint,
  PUCK_ROOT_ZONE,
  resolveSlashMenuItems,
} from "./slash-menu-items.js";

function spec(partial: Partial<BlockSpecV2> & { name: string }): BlockSpecV2 {
  return { render: () => null, ...partial };
}

describe("resolveSlashMenuItems", () => {
  test("projects every block in the registry into a SlashMenuItem", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading", category: "typography" }),
      spec({ name: "core/columns", title: "Columns", category: "layout" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.map((i) => i.name).sort()).toEqual([
      "core/columns",
      "core/heading",
    ]);
    expect(items.find((i) => i.name === "core/columns")?.category).toBe(
      "layout",
    );
  });

  test("matches blocks by title (substring) and name (substring), case-insensitive", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
      spec({ name: "core/paragraph", title: "Paragraph" }),
    ]);

    const byTitle = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "HEAD",
    });
    expect(byTitle.map((i) => i.name)).toEqual(["core/heading"]);

    const byName = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "paragraph",
    });
    expect(byName.map((i) => i.name)).toEqual(["core/paragraph"]);
  });

  test("matches keywords by prefix (alias semantics), not substring", () => {
    const registry = createBlockRegistry([
      spec({
        name: "x/pull",
        title: "Pull",
        keywords: ["blockquote"],
      }),
    ]);

    const prefixMatch = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "block",
    });
    expect(prefixMatch.map((i) => i.name)).toEqual(["x/pull"]);

    const substringNonMatch = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "quote",
    });
    expect(substringNonMatch.map((i) => i.name)).toEqual([]);
  });

  test("omits blocks whose `capability` is not present in the viewer's capability set", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
      spec({ name: "core/html", title: "HTML", capability: "edit_html" }),
    ]);

    const restricted = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });
    expect(restricted.map((i) => i.name)).toEqual(["core/heading"]);

    const elevated = resolveSlashMenuItems(registry, {
      capabilities: new Set(["edit_html"]),
      query: "",
    });
    expect(elevated.map((i) => i.name).sort()).toEqual([
      "core/heading",
      "core/html",
    ]);
  });

  test("ranks title matches above keyword matches above name-only matches", () => {
    const registry = createBlockRegistry([
      spec({ name: "z/title", title: "Quote Title" }),
      spec({ name: "z/keyword", title: "Pull", keywords: ["quote"] }),
      spec({ name: "core/quote", title: "Pull" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "quote",
    });

    expect(items.map((i) => i.name)).toEqual([
      "z/title",
      "z/keyword",
      "core/quote",
    ]);
  });

  test("returns the title verbatim and falls back to the block name when title is undefined", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/spacer" }),
      spec({ name: "core/heading", title: "Heading" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.find((i) => i.name === "core/spacer")?.title).toBe(
      "core/spacer",
    );
    expect(items.find((i) => i.name === "core/heading")?.title).toBe("Heading");
  });

  test("omits specs declared with `inserter: false` so structural-children stay out of the menu", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/table", title: "Table" }),
      spec({
        name: "core/table-row",
        title: "Table row",
        inserter: false,
      }),
      spec({
        name: "core/table-cell",
        title: "Table cell",
        inserter: false,
      }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.map((i) => i.name)).toEqual(["core/table"]);
  });

  test("keeps specs that omit `inserter` (default shown) and specs that opt in with `inserter: true`", () => {
    const registry = createBlockRegistry([
      spec({ name: "a/default", title: "Default" }),
      spec({ name: "a/opt-in", title: "Opt-in", inserter: true }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.map((i) => i.name).sort()).toEqual(["a/default", "a/opt-in"]);
  });

  test("emits one item per variation when a block declares variations, slugs distinguish them", () => {
    const registry = createBlockRegistry([
      spec({
        name: "core/list",
        title: "List",
        category: "text",
        variations: [
          { slug: "bullet", title: "Bulleted list", attrs: { variant: "bullet" } },
          {
            slug: "numbered",
            title: "Numbered list",
            attrs: { variant: "numbered" },
          },
        ],
      }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.map((i) => i.slug)).toEqual(["bullet", "numbered"]);
    expect(items.map((i) => i.title)).toEqual([
      "Bulleted list",
      "Numbered list",
    ]);
    expect(items.every((i) => i.name === "core/list")).toBe(true);
    expect(items[0]?.attrs).toEqual({ variant: "bullet" });
    expect(items[1]?.attrs).toEqual({ variant: "numbered" });
  });

  test("treats whitespace-only queries as empty (no filtering)", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
      spec({ name: "core/quote", title: "Quote" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "   ",
    });

    expect(items).toHaveLength(2);
  });
});

describe("nextInsertPoint", () => {
  test("returns root zone + end-of-content when no item is selected", () => {
    expect(nextInsertPoint(null, 4)).toEqual({
      zone: PUCK_ROOT_ZONE,
      index: 4,
    });
    expect(nextInsertPoint(undefined, 0)).toEqual({
      zone: PUCK_ROOT_ZONE,
      index: 0,
    });
  });

  test("inserts immediately after a selected top-level block in the root zone", () => {
    expect(
      nextInsertPoint({ zone: PUCK_ROOT_ZONE, index: 2 }, 5),
    ).toEqual({ zone: PUCK_ROOT_ZONE, index: 3 });
  });

  test("inserts immediately after a selected block inside a nested zone", () => {
    expect(
      nextInsertPoint({ zone: "section-abc:left", index: 0 }, 5),
    ).toEqual({ zone: "section-abc:left", index: 1 });
  });

  test("falls back to root zone when a selector lacks zone metadata", () => {
    expect(nextInsertPoint({ index: 1 }, 5)).toEqual({
      zone: PUCK_ROOT_ZONE,
      index: 2,
    });
  });
});
